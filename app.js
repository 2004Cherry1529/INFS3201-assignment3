// app.js
const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const business = require('./business');

const app = express();

app.engine('hbs', engine({ extname: '.hbs', defaultLayout: false }));
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

// ─── Auth Routes ──────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const session = await business.login(username, password);
        if (!session) {
            return res.render('login', { error: 'Invalid username or password' });
        }
        res.setHeader('Set-Cookie',
            `sessionId=${session.sessionId}; HttpOnly; SameSite=Strict; Path=/`
        );
        res.redirect('/');
    } catch (error) {
        res.send('Login error: ' + error.message);
    }
});

app.post('/logout', async (req, res) => {
    try {
        const sessionId = parseCookie(req, 'sessionId');
        if (sessionId) await business.logout(sessionId);
        res.setHeader('Set-Cookie', 'sessionId=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        res.redirect('/login');
    } catch (error) {
        res.send('Logout error: ' + error.message);
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
app.get('/shifts', requireAuth, async (req, res) => {
    try {
        const shifts = await business.getAllShifts();
        for (const shift of shifts) {
            shift.employeeDetails = await business.getEmployeesByShiftId(shift._id.toString());
            const hour = parseInt(shift.startTime.split(':')[0]);
            shift.isMorning = hour < 12;
        }
        res.render('shifts', { shifts, username: req.session.username });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});

// GET add shift form
app.get('/shifts', requireAuth, async (req, res) => {
    try {
        
        const shifts = await business.getAllShifts();
        console.log(
            shifts
        )
        for (const shift of shifts) {
            const shiftId = shiftId.toString(); 
            shift.employeeDetails = await business.getEmployeesByShiftId(shiftId);
            const hour = parseInt(shift.startTime.split(':')[0]);
            shift.isMorning = hour < 12;
        }

        res.render('shifts', { shifts, username: req.session.username });
    } catch (error) {
        res.send('Error: ' + error.message);
    }
});


// POST add shift
app.post('/shifts/add', requireAuth, async (req, res) => {
    try {
        const { date, startTime, endTime } = req.body;

        if (!date || !startTime || !endTime) {
            return res.render('add-shift', {
                error: 'All fields are required',
                formData: { date, startTime, endTime },
                username: req.session.username
            });
        }

        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        if (eh * 60 + em <= sh * 60 + sm) {
            return res.render('add-shift', {
                error: 'End time must be after start time',
                formData: { date, startTime, endTime },
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