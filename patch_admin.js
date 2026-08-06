const fs = require('fs');
let code = fs.readFileSync('backend/routes/admin.js', 'utf8');

const rejectRoute = `
router.post('/reject-signup', async (req, res) => {
  try {
    const { requestId } = req.body;
    await prisma.signupRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' }
    });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
`;

code = code.replace('module.exports = router;', rejectRoute + '\nmodule.exports = router;');
fs.writeFileSync('backend/routes/admin.js', code);
console.log('patched admin routes');
