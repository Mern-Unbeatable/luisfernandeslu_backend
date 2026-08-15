import http from 'http';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  console.log('--- Test 1: Forgot password with non-existent email ---');
  const r1 = await request('POST', '/api/auth/forgot-password', { email: 'nonexistent@example.com' });
  console.log('Status:', r1.status);
  console.log('Body:', r1.body);

  console.log('\n--- Test 2: Verify OTP with invalid OTP ---');
  const r2 = await request('POST', '/api/auth/verify-otp', { email: 'test@example.com', otp: '123456' });
  console.log('Status:', r2.status);
  console.log('Body:', r2.body);

  console.log('\n--- Test 3: Reset password without OTP ---');
  const r3 = await request('POST', '/api/auth/reset-password', { email: 'test@example.com', otp: '123456', password: 'newpass' });
  console.log('Status:', r3.status);
  console.log('Body:', r3.body);
}

test().catch(console.error);
