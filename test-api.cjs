const http = require('http');
const data = JSON.stringify({ amount: 10, subject: "餐饮美食", wardAddress: "0x123" });

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/alipay/pay',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, 'Response:', body));
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
