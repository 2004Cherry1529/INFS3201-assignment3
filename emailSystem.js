// emailSystem.js
/**
 * Email system - currently uses console.log
 * Same interface as real email system would use
 */

function sendEmail(to, subject, body) {
    console.log(`\n EMAIL SENT:`);
    console.log(`   To: ${to}`);
    console.log(`   Subject: ${subject}`);
    console.log(`   Body: ${body}`);
    console.log(`   [This would send a real email]\n`);
    
    return { success: true, message: "Email logged to console" };
}

module.exports = { sendEmail };