import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from actions import CloudwatchLog, DockerLogIngester

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

cloudwatch_log = CloudwatchLog()
docker_client = DockerLogIngester()


@app.get("/sources")
async def get_sources(environment: str = "cloudwatch"):
    if environment == "cloudwatch":
        sources = cloudwatch_log.get_log_streams()
    elif environment == "docker":
        sources = docker_client.get_log_streams()
    else:
        raise HTTPException(status_code=400, detail=f"No environment '{environment}'")

    return {"data": sources}


@app.get("/logs")
async def get_logs(
    environment: str,
    sources: str,
    start_time: int,
    end_time: int | None = None,
):
    sources = sources.split(',')

    if environment == 'cloudwatch':
        stime = datetime.datetime.utcfromtimestamp(start_time / 1000)
        print(stime)
        etime = datetime.datetime.utcfromtimestamp(end_time / 1000) if end_time else None
        print(etime)
        return {"data": cloudwatch_log.ingest(tuple(sources), stime, etime)}

    if environment == 'docker':
        stime = datetime.datetime.fromtimestamp(start_time / 1000)
        print(stime)
        return {"data": docker_client.ingest(tuple(sources), stime)}

