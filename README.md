# Backend

The project uses Poetry, FastAPI and Uvicorn. So, after installing the dependencies using `poetry install`, run the server

```
poetry run uvicorn main:app
```

If you encounter issues with Docker Client, make sure that Docker is running and that the user has access to the docker socket

```
sudo chmod 666 /var/run/docker.sock
```


# Frontend

```
npm install
npm start
```
