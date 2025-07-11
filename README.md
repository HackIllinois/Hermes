# Hermes

## Authentication
1. Start the server with `yarn start`
2. visit http://localhost:5555/api/auth/login in your browser
3. Log in with your HackIllinois email
4. You will receive an `access_token`. use the header `Authorization: <access_token_here>` for all requests.