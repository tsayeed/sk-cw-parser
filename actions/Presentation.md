# Loggly

## Motivation
- Unified view of all logs related to a request
- Complement existing setup
- Support both docker and cloudwatch
- Local and remote devbox
- Simple metrics based on the logs

## Technology
- FastAPI, React

## Features
- View logs aggregated from multiple channels i.e cloudwatch log streams, docker containers
- Group by request
- Display variables in easy-to-view UI
- Filter messages

## Demo

## Problems Faced
- Extracting variables from log messages
- Variation of log message format

## Future Thoughts
- More structured log messages
  - Encode tracebacks as a single string
  - Unified log format across services
  - Log messages as json/dict and use log handlers for different envs 
- Tag log messages by feature name across services
- Compare log messages across environment. Needs tag support
- Stream logs realtime
