import dataclasses
import ast
import json
import uuid
from datetime import datetime, timedelta

import boto3
import docker

cloudwatch = boto3.client("logs")


@dataclasses.dataclass
class Log:
    time: datetime
    source: str
    message: str
    request_uuid: str | None = None
    formatted_message: str | None = None
    event_id: str | None = None
    expressions: list = dataclasses.field(default_factory=list)


def get_uuid_or_str(data) -> uuid.UUID | str:
    try:
        id_ = uuid.UUID(data.replace("-", ""))
        return id_
    except:
        return data

def get_request_uuid(expressions: list) -> str | None:
    if not expressions: return None

    if isinstance(expressions[0], uuid.UUID):
        return str(expressions[0])
    else:
        for expr in expressions:
            if isinstance(expr, dict):
                if 'request_uuid' in expr:
                    return expr['request_uuid']
                if 'requestUuid' in expr:
                    return expr['requestUuid']

    return None


def parse_message(message: str) -> tuple[str, list]:
    stack = []
    current_expr_chars = []
    expressions = []
    formatted_message_pieces = []

    opening_braces = ("(", "[", "{")
    closing_braces = (")", "]", "}")
    brace_matching = dict(zip(closing_braces, opening_braces))

    for char in message:
        if stack or char in opening_braces:
            current_expr_chars.append(char)
        else:
            formatted_message_pieces.append(char)

        if char in opening_braces:
            stack.append(char)
        elif char in closing_braces:
            if stack[-1] != brace_matching[char]:
                raise ValueError(f"Invalid Expression: {''.join(current_expr_chars)}")
            else:
                stack.pop()
                if not stack:
                    expressions.append("".join(current_expr_chars))
                    current_expr_chars = []
                    formatted_message_pieces.append('$#$')

    res = []
    for expr in expressions:
        try:
            node = ast.literal_eval(expr)
            if type(node) == str:
                node = get_uuid_or_str(node)
            res.append(node)
        except Exception as e:
            print(e)
            if (
                expr.startswith("(") and expr.endswith(")") and "," not in expr
            ):  # likely request_uuid
                expr = expr.replace("(", "").replace(")", "")
                res.append(get_uuid_or_str(expr))
                continue

            res.append(expr)
    return "".join(formatted_message_pieces), res


class CloudwatchLog:
    def __init__(self):
        self.cloudwatch_logs = boto3.client("logs")

    def get_log_streams(self) -> list[str]:
        response = self.cloudwatch_logs.describe_log_groups()
        return [group["logGroupName"] for group in response["logGroups"]]

    def ingest(
        self, sources: tuple, start_time: datetime, end_time: datetime = None
    ) -> list[Log]:
        logs: list[Log] = []
        for source in sources:
            response = self.cloudwatch_logs.filter_log_events(
                logGroupName=source, startTime=int(start_time.timestamp() * 1000)
            )
            for log_event in response["events"]:
                if '"GET / HTTP/1.1" 200' in log_event.get('message'):
                    continue
                try:
                    formatted_message, expressions = parse_message(log_event.get("message", ""))
                except Exception:
                    # print("Failed parsing message", log_event.get("message", ""))
                    formatted_message, expressions = None, []

                logs.append(
                    Log(
                        datetime.utcfromtimestamp(log_event["timestamp"] / 1000),
                        source,
                        log_event["message"],
                        request_uuid=get_request_uuid(expressions),
                        formatted_message=formatted_message,
                        event_id=log_event["eventId"],
                        expressions=expressions,
                    )
                )

        return sorted(logs, key=lambda log: log.time)


class DockerLogIngester:
    def __init__(self):
        self.docker: docker.DockerClient = docker.from_env()

    def get_log_streams(self):
        running_containers = self.docker.containers.list()
        return [f"{container.name}:{container.short_id}" for container in running_containers]


    def ingest(self, sources: tuple, start_time: datetime, end_time: datetime = None):
        logs: list[Log] = []
        sources = [self.docker.containers.get(s.split(":")[-1]) for s in sources]
        for source in sources:
            response = source.logs(
                timestamps=True, since=int(start_time.timestamp())
            )
            for log_event in response.decode('utf8').split("\n"):
                if '"GET / HTTP/1.1" 200' in log_event:
                    continue
                parts = log_event.split(" ", 1)
                if len(parts) == 2:
                    datestr, message = parts
                else:
                    datestr, message = None, log_event

                try:
                    formatted_message, expressions = parse_message(message)
                except Exception:
                    print("Failed parsing message", message)
                    formatted_message, expressions = None, []

                logs.append(
                    Log(
                        datetime.fromisoformat(datestr.split(".")[0]) if datestr else datetime.now(),
                        f"{source.name}",
                        message,
                        request_uuid=get_request_uuid(expressions),
                        formatted_message=formatted_message,
                        event_id=uuid.uuid4().hex,
                        expressions=expressions,
                    )
                )

        return sorted(logs, key=lambda log: log.time)


if __name__ == '__main__':
    cw = CloudwatchLog()
    streams = [
        stream
        for stream in cw.get_log_streams()
        if stream.startswith("/fargate") and stream.endswith("dev")
    ]
    yesterday = datetime(2023, 1, 3)
    logs = cw.ingest(streams, yesterday)
    print(logs)

