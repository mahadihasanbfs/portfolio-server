// Node 25+ removed the deprecated `SlowBuffer` export, which old dependencies (jsonwebtoken > jwa >
// buffer-equal-constant-time) still read at load time. Re-adding it keeps the server running on newer Node.
const buffer = require("buffer");
if (!buffer.SlowBuffer) buffer.SlowBuffer = buffer.Buffer;
