# Hermes

## Running Hermes

### Local development
1. Install dependencies with `yarn`
2. Start the API with `yarn dev`

### Local production-style run
1. Build the server with `yarn build`
2. Start the compiled server with `yarn start`

### Docker / EC2 / CodeDeploy
1. Create a `.env` file from `.env.example`
2. Start the container with `docker compose up --build -d`
3. View logs with `docker compose logs -f hermes`

The included `docker-compose.yml` is intended to be the production-friendly entrypoint for a single EC2-hosted Hermes deployment. It builds the existing `Dockerfile`, injects environment variables from `.env`, maps the configured `PORT`, and adds a container healthcheck that works well with CodeDeploy hook scripts.

## Authentication
1. Start the server with `yarn dev`
2. visit http://localhost:5555/api/auth/login in your browser
3. Log in with your HackIllinois email
4. You will receive an `access_token`. use the header `Authorization: <access_token_here>` for all requests.

### Contact
- Email [akul.sharma@hackillinois.org](mailto:akul.sharma@hackillinois.org) with questions. API docs are entirely AI generated so they may be a bit inaccurate LOL
