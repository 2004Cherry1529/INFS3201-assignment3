// transform_db.js
// Run ONCE after backing up your database. Idempotent safe re-run.

const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

const url = 'mongodb+srv://60304691_db:12class34@cluster0.fpc0wqb.mongodb.net/?appName=Cluster0';
const dbName = 'infs3201_winter2026';

async function transformDatabase() {
    const client = new MongoClient(url);

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        const db = client.db(dbName);
        const shiftsCol = db.collection('shifts');
        const employeesCol = db.collection('employees');
        const assignmentsCol = db.collection('assignments');
        const usersCol = db.collection('users');
        const securityLogCol = db.collection('security_log');
        const sessionsCol = db.collection('sessions');

        // ── STEP 1: Add empty employees array to all shifts
        const step1 = await shiftsCol.updateMany(
            { employees: { $exists: false } },
            { $set: { employees: [] } }
        );
        console.log(`✅ Step 1: Added employees array to ${step1.modifiedCount} shift(s)`);

        // ── STEP 2: Embed assignments into shift.employees arrays
        const allAssignments = await assignmentsCol.find({}).toArray();
        console.log(`Found ${allAssignments.length} assignments`);

        let migrated = 0, skipped = 0;
        for (const a of allAssignments) {
            const employeeDoc = await employeesCol.findOne({ employeeId: a.employeeId }, { projection: { _id: 1 } });
            const shiftDoc = await shiftsCol.findOne({ shiftId: a.shiftId }, { projection: { _id: 1 } });

            if (!employeeDoc || !shiftDoc) {
                skipped++;
                continue;
            }

            await shiftsCol.updateOne(
                { _id: shiftDoc._id },
                { $addToSet: { employees: employeeDoc._id } }
            );
            migrated++;
        }
        console.log(`✅ Step 2: Migrated ${migrated} assignments, skipped ${skipped} orphan(s)`);

        // ── STEP 3: Add photo field to all employees (null default)
        const step3 = await employeesCol.updateMany(
            { photo: { $exists: false } },
            { $set: { photo: null } }
        );
        console.log(`✅ Step 3: Added photo field to ${step3.modifiedCount} employee(s)`);

        // ── STEP 4: Remove employeeId from employees
        const step4 = await employeesCol.updateMany({}, { $unset: { employeeId: "" } });
        console.log(`✅ Step 4: Removed employeeId from ${step4.modifiedCount} employee(s)`);

        // ── STEP 5: Remove shiftId from shifts
        const step5 = await shiftsCol.updateMany({}, { $unset: { shiftId: "" } });
        console.log(`✅ Step 5: Removed shiftId from ${step5.modifiedCount} shift(s)`);

        // ── STEP 6: Drop assignments collection
        const colExists = await db.listCollections({ name: 'assignments' }).hasNext();
        if (colExists) {
            await assignmentsCol.drop();
            console.log('✅ Step 6: assignments collection dropped');
        } else {
            console.log('✅ Step 6: assignments collection already removed');
        }

        // ── STEP 7: Setup users collection with test accounts
        await usersCol.createIndex({ username: 1 }, { unique: true });

        const testUsers = [
            { username: 'admin', password: 'admin123' },
            { username: 'testuser', password: 'testpass123' }
        ];

        for (const u of testUsers) {
            const hashedPassword = crypto.createHash('sha256').update(u.password).digest('hex');
            await usersCol.updateOne(
                { username: u.username },
                { $setOnInsert: { username: u.username, hashedPassword } },
                { upsert: true }
            );
        }
        console.log('✅ Step 7: Users collection created with 2 test accounts');

        // ── STEP 8: Setup security_log collection with index
        await securityLogCol.createIndex({ timestamp: -1 });
        await securityLogCol.insertOne({
            timestamp: new Date(),
            username: null,
            urlAccessed: '/system/migration',
            method: 'SYSTEM'
        });
        console.log('✅ Step 8: security_log collection ready');

        // ── STEP 9: Setup sessions collection with TTL index
        await sessionsCol.createIndex({ sessionId: 1 }, { unique: true });
        await sessionsCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        console.log('✅ Step 9: sessions collection ready with TTL');

        // ── STEP 10: Verification
        const totalShifts = await shiftsCol.countDocuments();
        const shiftsWithEmps = await shiftsCol.countDocuments({ employees: { $not: { $size: 0 } } });
        const totalEmployees = await employeesCol.countDocuments();
        const empHasPhoto = await employeesCol.countDocuments({ photo: { $exists: true } });
        const empHasOldId = await employeesCol.countDocuments({ employeeId: { $exists: true } });
        const shiftHasOldId = await shiftsCol.countDocuments({ shiftId: { $exists: true } });
        const totalUsers = await usersCol.countDocuments();
        const totalLogs = await securityLogCol.countDocuments();

        console.log(`\n✅ Verification:`);
        console.log(`  Employees total: ${totalEmployees}, photo field: ${empHasPhoto}, employeeId remaining: ${empHasOldId}`);
        console.log(`  Shifts total: ${totalShifts}, with employees: ${shiftsWithEmps}, shiftId remaining: ${shiftHasOldId}`);
        console.log(`  Users total: ${totalUsers}, Security log entries: ${totalLogs}`);

        console.log('\n✅ Migration complete!');
        console.log('Test credentials for README.md:');
        console.log('  username: admin      password: admin123');
        console.log('  username: testuser   password: testpass123');

    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    } finally {
        await client.close();
    }
}

transformDatabase();