// app.js
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const business = require('./business');

const app = express();
const multer = require('multer');
const fs = require('fs');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: function(req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
        cb(null, uploadDir);
    },
    filename: function(req, file, cb) {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files allowed'));
        }
    }
});
app.engine('hbs', engine({
    extname: '.hbs',
    defaultLayout: false,
    helpers: {
        eq: (a, b) => a === b
    }
}));



app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Cookie helper ────────────────────────────────────────────────────────────
/**
 * Parse a single cookie value from the request by name.
 * @param {Object} req - Express request
 * @param {string} name - Cookie name
 * @returns {string|null}
 */
function parseCookie(req, name) {
    return req.headers.cookie
        ?.split(';')
        .find(c => c.trim().startsWith(name + '='))
        ?.split('=')[1] ?? null;
}

// ─── Security Logging Middleware ──────────────────────────────────────────────
app.use(async (req, res, next) => {
    try {
        const sessionId = parseCookie(req, 'sessionId');
        let username = null;
        if (sessionId) {
            const session = await business.validateSession(sessionId);
            if (session) username = session.username;
        }
        await business.logAccess({ username, urlAccessed: req.originalUrl, method: req.method });
    } catch (_) {}
    next();
});

// ─── Auth Middleware ──────────────────────────────────────────────────────────
/**
 * Middleware: redirect to /login if no valid session exists.
 * Extends session TTL by 5 minutes on every authenticated visit.
 */
async function requireAuth(req, res, next) {
    const sessionId = parseCookie(req, 'sessionId');
    if (!sessionId) return res.redirect('/login');

    const session = await business.validateSession(sessionId);
    if (!session) return res.redirect('/login');

    await business.touchSession(session.sessionId);
    req.session = session;
    next();
}

// GET login page
app.get('/login', (req, res) => {
    res.render('login', { step: 'password' }); // step indicates password or 2FA
});

// POST login - Step 1: Verify password
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await business.initiateLogin(username, password);
        
        if (!result.success) {
            return res.render('login', { error: result.message, step: 'password' });
        }
        
        if (result.needs2FA) {
            // Show 2FA code entry page
            return res.render('login', { 
                step: '2fa', 
                tempSessionId: result.tempSessionId,
                username: result.username,
                message: result.message
            });
        }
    } catch (error) {
        res.render('login', { error: error.message, step: 'password' });
    }
});

// POST verify 2FA - Step 2
app.post('/verify-2fa', async (req, res) => {
    try {
        const { username, code, tempSessionId } = req.body;
        const result = await business.verify2FALogin(username, code, tempSessionId);
        
        if (!result.success) {
            return res.render('login', { 
                step: '2fa', 
                error: result.message,
                tempSessionId,
                username
            });
        }
        
        // Set session cookie
        res.setHeader('Set-Cookie',
            `sessionId=${result.session.sessionId}; HttpOnly; SameSite=Strict; Path=/`
        );
        res.redirect('/');
    } catch (error) {
        res.render('login', { step: '2fa', error: error.message });
    }
});
// GET employee documents page
app.get('/employee/:id/documents', requireAuth, async (req, res) => {
    try {
        const employee = await business.findEmployee(req.params.id);
        if (!employee) return res.send('Employee not found');
        
        const documents = await business.getEmployeeDocuments(req.params.id);
        res.render('employee-documents', { 
            employee, 
            documents,
            username: req.session.username 
        });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// POST upload document
app.post('/employee/:id/documents/upload', requireAuth, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.send('No file uploaded');
        }
        
        await business.uploadEmployeeDocument(req.params.id, req.file);
        res.redirect(`/employee/${req.params.id}/documents`);
    } catch (error) {
        res.send('Upload error: ' + error.message);
    }
});

// GET download document (protected - no public static route)
app.get('/employee/:id/documents/:docId/download', requireAuth, async (req, res) => {
    try {
        const doc = await business.getDocumentForDownload(req.params.id, req.params.docId);
        if (!doc) return res.status(404).send('Document not found');
        
        res.download(doc.filepath, doc.filename);
    } catch (error) {
        res.send('Download error: ' + error.message);
    }
});

// POST delete document
app.post('/employee/:id/documents/:docId/delete', requireAuth, async (req, res) => {
    try {
        await business.deleteEmployeeDocument(req.params.id, req.params.docId);
        res.redirect(`/employee/${req.params.id}/documents`);
    } catch (error) {
        res.send('Delete error: ' + error.message);
    }
});
// ─── Employee Routes ──────────────────────────────────────────────────────────

// Landing — list all employees
app.get('/', requireAuth, async (req, res) => {
    try {
        const employees = await business.getAllEmployees();
        res.render('landing', { employees, username: req.session.username });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// GET add employee form
app.get('/employee/add', requireAuth, (req, res) => {
    res.render('add-employee', { username: req.session.username });
});

// POST add employee
app.post('/employee/add', requireAuth, async (req, res) => {
    try {
        const { name, phone } = req.body;
        const trimmedName  = name  ? name.trim()  : '';
        const trimmedPhone = phone ? phone.trim() : '';

        if (!trimmedName) {
            return res.render('add-employee', {
                error: 'Name cannot be empty',
                formData: { name: trimmedName, phone: trimmedPhone },
                username: req.session.username
            });
        }

        const phoneRegex = /^\d{4}-\d{4}$/;
        if (!phoneRegex.test(trimmedPhone)) {
            return res.render('add-employee', {
                error: 'Phone must be in format 1234-5678',
                formData: { name: trimmedName, phone: trimmedPhone },
                username: req.session.username
            });
        }

        await business.addEmployeeRecord({ name: trimmedName, phone: trimmedPhone });
        res.redirect('/');
    } catch (error) {
        res.send('Error adding employee: ' + error.message);
    }
});

// View employee details + their shifts
// NOTE: this route must come AFTER /employee/add so "add" isn't treated as an :id
app.get('/employee/:id', requireAuth, async (req, res) => {
    try {
        const employee = await business.findEmployee(req.params.id);
        if (!employee) return res.send('Employee not found');
        const shifts = await business.getEmployeeShifts(req.params.id);
        res.render('employee-details', { employee, shifts, username: req.session.username });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// GET edit employee form
app.get('/employee/:id/edit', requireAuth, async (req, res) => {
    try {
        const employee = await business.findEmployee(req.params.id);
        if (!employee) return res.send('Employee not found');
        res.render('edit-employee', { employee, username: req.session.username });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// POST edit employee
app.post('/employee/:id/edit', requireAuth, async (req, res) => {
    try {
        const { name, phone } = req.body;
        const trimmedName  = name  ? name.trim()  : '';
        const trimmedPhone = phone ? phone.trim() : '';

        if (!trimmedName) return res.send('Error: Name cannot be empty');

        const phoneRegex = /^\d{4}-\d{4}$/;
        if (!phoneRegex.test(trimmedPhone)) {
            return res.send('Error: Phone must be in format 1234-5678');
        }

        await business.updateEmployeeRecord(req.params.id, { name: trimmedName, phone: trimmedPhone });
        res.redirect('/');
    } catch (error) {
        res.send('Error updating: ' + error.message);
    }
});

// POST upload employee photo (Phase 5 — wire multer here)
app.post('/employee/:id/photo', requireAuth, async (req, res) => {
    try {
        // TODO Phase 5: install multer, then uncomment:
        // const photoPath = `/uploads/${req.file.filename}`;
        // await business.updateEmployeePhoto(req.params.id, photoPath);
        res.send('Photo upload not yet implemented — add multer in Phase 5');
    } catch (error) {
        res.send('Error uploading photo: ' + error.message);
    }
});

// POST delete employee (cascade removes from all shifts)
app.post('/employee/:id/delete', requireAuth, async (req, res) => {
    try {
        await business.deleteEmployee(req.params.id);
        res.redirect('/');
    } catch (error) {
        res.send('Error deleting employee: ' + error.message);
    }
});

// ─── Shift Routes ─────────────────────────────────────────────────────────────

// List all shifts with populated employee names
// ─── GET all shifts ───────────────────────────────
app.get('/shifts', requireAuth, async (req, res) => {
    try {
        const shifts = await business.getAllShifts();

        for (let i = 0; i < shifts.length; i++) {
            const shift = shifts[i];

            shift.employeeDetails =
                await business.getEmployeesByShiftId(shift._id.toString());

            const hour = parseInt(shift.startTime.slice(0, 2));
            shift.isMorning = hour < 12;
        }

        res.render('shifts', {
            shifts,
            username: req.session.username
        });

    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

app.get('/shifts/add', requireAuth, (req, res) => {
    res.render('add-shift', {
        username: req.session.username
    });
});
// POST add shift
app.post('/shifts/add', requireAuth, async (req, res) => {
    try {
        const { date, startTime, endTime } = req.body;

        if (!date || !startTime || !endTime) {
            return res.render('add-shift', {
                error: 'All fields are required',
                username: req.session.username
            });
        }

        const sh = parseInt(startTime.slice(0, 2));
        const eh = parseInt(endTime.slice(0, 2));

        if (eh <= sh) {
            return res.render('add-shift', {
                error: 'End time must be after start time',
                username: req.session.username
            });
        }

        await business.createShift({ date, startTime, endTime });

        res.redirect('/shifts');

    } catch (error) {
        res.send('Error adding shift: ' + error.message);
    }
});

// POST assign employee to shift
app.post('/shift/:shiftId/assign', requireAuth, async (req, res) => {
    try {
        const { employeeId } = req.body;
        const result = await business.assignEmployeeToShift(req.params.shiftId, employeeId);
        if (!result.success) return res.send('Error: ' + result.message);
        res.redirect('/shifts');
    } catch (error) {
        res.send('Error assigning employee: ' + error.message);
    }
});

// POST remove employee from shift
app.post('/shift/:shiftId/remove', requireAuth, async (req, res) => {
    try {
        const { employeeId } = req.body;
        await business.removeEmployeeFromShift(req.params.shiftId, employeeId);
        res.redirect('/shifts');
    } catch (error) {
        res.send('Error removing employee: ' + error.message);
    }
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(3001, () => {
    console.log('Server running on http://localhost:3001');
});