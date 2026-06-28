const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '123';
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const DEFAULT_SETTINGS = {
  dashboardTitle: 'Web Hub',
  dashboardSubtitle: 'A lightweight landing zone for your self-hosted services.',
  theme: 'glass',
  customCss: ''
};

function ensureDbFile() {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ settings: DEFAULT_SETTINGS, services: [], notifications: [] }, null, 2));
  }
}

function readDb() {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return {
    settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    services: Array.isArray(parsed.services) ? parsed.services : [],
    notifications: Array.isArray(parsed.notifications) ? parsed.notifications : []
  };
}

function writeDb(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeService(service) {
  return {
    id: service.id || createId('service'),
    name: String(service.name || '').trim(),
    url: String(service.url || '').trim(),
    description: String(service.description || '').trim(),
    icon: String(service.icon || '◉').trim(),
    checkStatus: service.checkStatus !== false,
    status: service.status || 'unknown',
    lastChecked: service.lastChecked || null,
    lastResponseTime: service.lastResponseTime || null,
    previewNote: service.previewNote || ''
  };
}

function normalizeNotification(notification) {
  return {
    id: notification.id || createId('notification'),
    type: notification.type || 'webhook',
    title: notification.title || 'Incoming alert',
    message: notification.message || '',
    level: notification.level || 'info',
    payload: notification.payload || {},
    timestamp: notification.timestamp || new Date().toISOString()
  };
}

function saveSettings(settingsInput) {
  const db = readDb();
  db.settings = {
    ...db.settings,
    dashboardTitle: String(settingsInput.dashboardTitle || DEFAULT_SETTINGS.dashboardTitle),
    dashboardSubtitle: String(settingsInput.dashboardSubtitle || DEFAULT_SETTINGS.dashboardSubtitle),
    theme: ['glass', 'neon', 'light'].includes(settingsInput.theme) ? settingsInput.theme : 'glass',
    customCss: String(settingsInput.customCss || '')
  };
  writeDb(db);
}

function saveServices(services) {
  const db = readDb();
  db.services = services.map(normalizeService);
  writeDb(db);
}

function saveNotifications(notifications) {
  const db = readDb();
  db.notifications = notifications.map(normalizeNotification).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  writeDb(db);
}

function loadData() {
  const db = readDb();
  return {
    settings: db.settings,
    services: db.services.map(normalizeService),
    notifications: db.notifications.map(normalizeNotification).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  };
}

function pingService(service) {
  return new Promise((resolve) => {
    try {
      const parsed = new url.URL(service.url);
      const transport = parsed.protocol === 'https:' ? https : http;
      const started = Date.now();
      const request = transport.request(
        parsed,
        {
          method: 'GET',
          timeout: 5000,
          headers: {
            'User-Agent': 'WebHubDashboard/1.0'
          }
        },
        (response) => {
          response.resume();
          const elapsed = Date.now() - started;
          resolve({
            status: response.statusCode >= 200 && response.statusCode < 500 ? 'online' : 'offline',
            lastChecked: new Date().toISOString(),
            lastResponseTime: `${elapsed}ms`
          });
        }
      );

      request.on('timeout', () => {
        request.destroy(new Error('timeout'));
      });

      request.on('error', () => {
        resolve({
          status: 'offline',
          lastChecked: new Date().toISOString(),
          lastResponseTime: null
        });
      });

      request.end();
    } catch (error) {
      resolve({
        status: 'offline',
        lastChecked: new Date().toISOString(),
        lastResponseTime: null
      });
    }
  });
}

async function updateStatuses() {
  const db = readDb();
  const services = db.services.map(normalizeService);
  for (const service of services) {
    if (!service.checkStatus || !service.url) continue;
    const result = await pingService(service);
    service.status = result.status;
    service.lastChecked = result.lastChecked;
    service.lastResponseTime = result.lastResponseTime;
  }
  saveServices(services);
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login');
}

function sanitizeText(value) {
  return String(value || '').trim();
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'web-hub-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax'
    }
  })
);

app.use((req, res, next) => {
  const { settings } = loadData();
  res.locals.settings = settings;
  res.locals.currentPath = req.path;
  next();
});

app.get('/', (req, res) => {
  const data = loadData();
  res.render('index', {
    services: data.services,
    notifications: data.notifications.slice(0, 5),
    theme: data.settings.theme,
    customCss: data.settings.customCss,
    title: data.settings.dashboardTitle,
    subtitle: data.settings.dashboardSubtitle
  });
});

app.get('/notifications', (req, res) => {
  const data = loadData();
  res.render('notifications', {
    notifications: data.notifications,
    theme: data.settings.theme,
    customCss: data.settings.customCss,
    title: data.settings.dashboardTitle
  });
});

app.get('/api/data', (req, res) => {
  const data = loadData();
  res.json({
    settings: data.settings,
    services: data.services,
    notifications: data.notifications
  });
});

app.post('/webhook/amp', (req, res) => {
  const payload = req.body || {};
  const message = sanitizeText(payload.message || payload.detail || payload.status || 'AMP webhook received');
  const title = sanitizeText(payload.title || payload.event || payload.instanceName || 'AMP alert');
  const level = sanitizeText(payload.level || payload.severity || payload.state || 'info').toLowerCase();

  const notification = normalizeNotification({
    type: 'amp-webhook',
    title,
    message,
    level: ['info', 'success', 'warning', 'error'].includes(level) ? level : 'info',
    payload,
    timestamp: payload.timestamp || new Date().toISOString()
  });

  const db = readDb();
  db.notifications = [notification, ...db.notifications.map(normalizeNotification)].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 200);
  writeDb(db);

  res.json({ ok: true, received: true, id: notification.id });
});

app.get('/admin/login', (req, res) => {
  if (req.session.isAdmin) return res.redirect('/admin');
  res.render('admin-login', { error: null });
});

app.post('/admin/login', (req, res) => {
  const password = String(req.body.password || '');
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  return res.status(401).render('admin-login', { error: 'Incorrect password.' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/admin', requireAdmin, (req, res) => {
  const data = loadData();
  res.render('admin', {
    services: data.services,
    settings: data.settings,
    theme: data.settings.theme,
    customCss: data.settings.customCss
  });
});

app.post('/admin/settings', requireAdmin, (req, res) => {
  saveSettings(req.body);
  return res.redirect('/admin');
});

app.post('/admin/services', requireAdmin, (req, res) => {
  const data = loadData();
  const services = data.services.slice();
  services.push(
    normalizeService({
      name: req.body.name,
      url: req.body.url,
      description: req.body.description,
      icon: req.body.icon,
      checkStatus: req.body.checkStatus === 'on'
    })
  );
  saveServices(services);
  return res.redirect('/admin');
});

app.post('/admin/services/:id', requireAdmin, (req, res) => {
  const data = loadData();
  const services = data.services.map((service) => {
    if (service.id !== req.params.id) return service;
    return normalizeService({
      ...service,
      name: req.body.name,
      url: req.body.url,
      description: req.body.description,
      icon: req.body.icon,
      checkStatus: req.body.checkStatus === 'on'
    });
  });
  saveServices(services);
  return res.redirect('/admin');
});

app.post('/admin/services/:id/delete', requireAdmin, (req, res) => {
  const data = loadData();
  const services = data.services.filter((service) => service.id !== req.params.id);
  saveServices(services);
  return res.redirect('/admin');
});

app.post('/admin/services/recheck', requireAdmin, async (req, res) => {
  await updateStatuses();
  return res.redirect('/admin');
});

app.get('/api/services', async (req, res) => {
  const data = loadData();
  const services = data.services.map(normalizeService);
  const checked = [];
  for (const service of services) {
    if (service.checkStatus && service.url) {
      const result = await pingService(service);
      checked.push({ ...service, ...result });
    } else {
      checked.push(service);
    }
  }
  saveServices(checked);
  res.json({ services: checked });
});

app.get('/api/notifications', (req, res) => {
  const data = loadData();
  res.json({ notifications: data.notifications });
});

app.get('/api/theme.css', (req, res) => {
  const data = loadData();
  res.type('text/css').send(data.settings.customCss || '');
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Not found' });
});

setInterval(() => {
  updateStatuses().catch(() => {});
}, 5 * 60 * 1000);

ensureDbFile();
updateStatuses().catch(() => {});

app.listen(PORT, () => {
  console.log(`Web Hub Dashboard running on http://localhost:${PORT}`);
});
