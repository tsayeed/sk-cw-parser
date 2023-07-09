from actions import get_cloudwatch_logs
from datetime import datetime, timedelta

get_cloudwatch_logs("/fargate/service/cash-dev", int((datetime.today() - timedelta(days=1)).timestamp()))
