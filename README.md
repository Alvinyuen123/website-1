# Web Hub Dashboard

A lightweight self-hosted Express dashboard for managing service links, monitoring status, switching themes, and collecting AMP webhook notifications.

## Features

- Single-page style dashboard for subdomains and self-hosted services
- Secure admin panel at `/admin` with a default password of `123`
- Dynamic service cards with live status polling and hover previews
- Theme switching with three built-in CSS themes and custom CSS override support
- Public webhook endpoint at `/webhook/amp`
- Notifications page at `/notifications` with timestamp-sorted alert cards

## Requirements

- Node.js 18+ recommended

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

## Admin Access

- Visit `/admin`
- Default password: `123`

Set a custom password with:

```bash
ADMIN_PASSWORD=your-password npm start
```

## Docker

```bash
docker build -t web-hub-dashboard .
docker run -p 3000:3000 -v ${PWD}/data:/app/data web-hub-dashboard
```

## Project Structure

- `server.js` - Express app, data persistence, status checks, webhook handling
- `views/` - EJS views for dashboard, admin, and notifications
- `public/css/` - shared styling and theme files
- `public/js/` - client-side polling and interactions
- `data/db.json` - portable JSON database
