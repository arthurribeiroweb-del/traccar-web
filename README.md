# [Traccar Web Interface](https://www.traccar.org)

## Overview

Traccar is open source server for various GPS tracking devices. This repository contains web interface for the Traccar platform. For back-end checkout [main Traccar repository](https://github.com/tananaev/traccar).

The app uses React, Material UI and MapLibre. For more information on how to build it please check the [web app documentation](https://www.traccar.org/build-web-app/).

## Coolify Deploy (Recommended)

This frontend is designed to be deployed as a static site and talk to the
Traccar backend via the same domain using `/api` paths.

Quick start (single domain):
- Domain: `traccarpro.com.br`
- Backend: `arthurribeiroweb-del/traccar` app in Coolify
- Frontend: this repo, deployed as a static site
- Proxy paths: `/` -> frontend, `/api` and `/api/socket` -> backend

Steps in Coolify:
1) Create an app from GitHub: `arthurribeiroweb-del/traccar-web`
2) Build type: Static (or Node/Static)
3) Build command: `npm ci && npm run build`
4) Output directory: `build`
5) Enable Auto Deploy (GitHub pushes deploy automatically)

Notes:
- The UI uses relative `/api` calls, so proxying on the same domain avoids CORS.
- Keep the backend app running first, then deploy this frontend.

## Team

- Anton Tananaev ([anton@traccar.org](mailto:anton@traccar.org))
- Andrey Kunitsyn ([andrey@traccar.org](mailto:andrey@traccar.org))

## License

    Apache License, Version 2.0

    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at

        http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
