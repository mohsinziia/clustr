import fs from 'fs';

async function run() {
  try {
    fs.writeFileSync('dummy.mp4', 'dummy video content');
    fs.writeFileSync('dummy.jpg', 'dummy image content');

    const uniqueUser = `testuser_${Date.now()}`;
    const regForm = new FormData();
    regForm.append('fullName', 'Test User');
    regForm.append('email', `${uniqueUser}@test.com`);
    regForm.append('username', uniqueUser);
    regForm.append('password', 'password123');
    regForm.append('avatar', new Blob([fs.readFileSync('dummy.jpg')]), 'dummy.jpg');

    const regRes = await fetch('http://127.0.0.1:8000/api/v1/users/register', {
      method: 'POST',
      body: regForm
    });

    const loginRes = await fetch('http://127.0.0.1:8000/api/v1/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${uniqueUser}@test.com`, password: 'password123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.data.accessToken;
    const cookie = loginRes.headers.get('set-cookie') || `accessToken=${token}`;

    const uploadForm = new FormData();
    uploadForm.append('title', 'Test Video');
    uploadForm.append('description', 'Test Description');
    uploadForm.append('isPublished', 'true');
    uploadForm.append('videoFile', new Blob([fs.readFileSync('dummy.mp4')]), 'dummy.mp4');
    uploadForm.append('thumbnail', new Blob([fs.readFileSync('dummy.jpg')]), 'dummy.jpg');

    const uploadRes = await fetch('http://127.0.0.1:8000/api/v1/videos', {
      method: 'POST',
      headers: {
        'Cookie': cookie,
        'Authorization': `Bearer ${token}`
      },
      body: uploadForm
    });

    if (!uploadRes.ok) {
      console.error("Status:", uploadRes.status);
      console.error("Body:", await uploadRes.text());
    } else {
      console.log("Success:", await uploadRes.json());
    }
  } catch (err) {
    console.error(err);
  } finally {
    if (fs.existsSync('dummy.mp4')) fs.unlinkSync('dummy.mp4');
    if (fs.existsSync('dummy.jpg')) fs.unlinkSync('dummy.jpg');
  }
}
run();
