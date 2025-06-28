const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;
const DEPLOYED = process.env.DEPLOYED; // Check if deployed
const DATA_FILE = DEPLOYED ? '/var/data/constellation_data.json' : path.join(__dirname, 'constellation_data.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // Secret password for admin mode

app.use(bodyParser.json());
app.use(express.static('public'));

async function loadData() {
    try {
        const data = await fs.readFile(DATA_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return {};
    }
}

async function saveData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

let constellationData = {};

loadData().then(data => {
    constellationData = data;
});

app.get('/api/constellations/all', (req, res) => {
    const allData = Object.entries(constellationData)
        .filter(([id]) => !id.startsWith('deleted_'))
        .map(([id, { name, myth, timestamp }]) => ({
            id,
            name,
            myth,
            timestamp
        }));
    res.json(allData);
});

app.get('/api/constellations/archive', (req, res) => {
    const allData = Object.entries(constellationData).map(([id, { name, myth, timestamp }]) => ({
        id,
        name,
        myth,
        timestamp
    }));
    res.json(allData);
});

app.get('/api/constellations/:id', (req, res) => {
    const id = req.params.id;
    if (constellationData[id]) {
        res.json(constellationData[id]);
    } else {
        res.status(404).json({ error: 'Constellation not found' });
    }
});

app.post('/api/constellations/:id', async (req, res) => {
    const id = req.params.id;

    if (parseInt(id, 10) % 2 === 0) {
        return res.status(400).json({ error: 'Constellation ID must be an odd number' });
    }

    const { name, myth } = req.body;

    if (constellationData[id]) {
        const adminPassword = req.headers['admin-password'];
        if (adminPassword !== ADMIN_PASSWORD) {
            return res.status(403).json({ error: 'Access denied: ID already exists' });
        }
    }

    if (name && myth) {
        constellationData[id] = {
            name,
            myth,
            timestamp: new Date().toISOString()
        };
        await saveData(constellationData);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: 'Invalid request' });
    }
});

// Admin endpoint to delete constellations
app.delete('/api/constellations/:id', async (req, res) => {
    const adminPassword = req.headers['admin-password'];
    if (adminPassword !== ADMIN_PASSWORD) {
        return res.status(403).json({ error: 'Access denied' });
    }

    const id = req.params.id;
    if (constellationData[id]) {
        const hash = crypto.createHash('sha256').update(JSON.stringify(constellationData[id])).digest('hex').slice(0, 8);
        const deletedId = `deleted_${id}_${hash}`;
        constellationData[deletedId] = { ...constellationData[id], id: deletedId };
        delete constellationData[id];
        await saveData(constellationData);
        res.json({ success: true, newId: deletedId });
    } else {
        res.status(404).json({ error: 'Constellation not found' });
    }
});

// Endpoint to validate admin password
app.post('/api/validate-password', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        res.json({ valid: true });
    } else {
        res.status(403).json({ error: 'Invalid password' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`Using data file: ${DATA_FILE}`);
});