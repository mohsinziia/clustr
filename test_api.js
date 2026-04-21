async function test() {
  try {
    const username = "newuser_api_" + Date.now();
    console.log("Registering user:", username);
    const registerRes = await fetch('http://localhost:8000/api/v1/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: "New User API",
        email: `${username}@example.com`,
        username: username,
        password: "password123"
      })
    });
    console.log("Registered status:", registerRes.status);
    
    const loginRes = await fetch('http://localhost:8000/api/v1/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: "password123"
      })
    });
    const loginData = await loginRes.json();
    const accessToken = loginData.data.accessToken;
    console.log("Logged in status:", loginRes.status);
    
    console.log("Fetching channel profile...");
    const profileRes = await fetch(`http://localhost:8000/api/v1/users/c/${username}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    const profileData = await profileRes.json();
    console.log("Profile fetched status:", profileRes.status);
    console.log("Profile data:", profileData);
    
  } catch (error) {
    console.error("Error:", error);
  }
}
test();
