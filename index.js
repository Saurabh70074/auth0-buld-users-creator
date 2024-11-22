const express = require('express');
const axios = require('axios');
const nodemailer = require('nodemailer');
const FormData = require('form-data');
const fs = require('fs'); ;
const fsMoodle = require('fs').promises; ;
const app = express();


// Set your Auth0 details here
const AUTH0_DOMAIN = 'dev-245l7o4d2ki6i2rq.us.auth0.com';
const AUTH0_CLIENT_ID = '1Nhvu4Bnr3ki2pDStNah31Z9QiPuorfs';
const AUTH0_CLIENT_SECRET = '8kJM-Ksh8ovMKLMXOMy9zrh8V5ESzCcPF8WMKeYjU96RH0exwnEXQhL2RkIalpMT';
const MOODLE_URL = 'https://sassoon.edvantalabs.com';
const BOUNDLESS_API = 'https://integrations-dev.boundlesslearning.com/bdm/api/user';
const AUTH0_CONNECTION_ID = 'con_mIZ8kSMehWSugTcY';

const readJSONFile = async (filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`Failed to read JSON file: ${error.message}`);
  }
};

// Endpoint to get Auth0 Management API Token
async function getManagementToken() {

        const url = 'https://dev-245l7o4d2ki6i2rq.us.auth0.com/oauth/token';
        const body = {
            client_id: 'wsTskEnYqpJkK98LUl8mTDvACGTu8XuO',
            client_secret: 'V4HwnOsreLbk9NVOMGTPVRQO4aZZXBkqQ2D45t4tZwSTdB_2yIRsGf3Yon8bXh8E',
            audience: 'https://dev-245l7o4d2ki6i2rq.us.auth0.com/api/v2/',
            grant_type: 'client_credentials',
          };

          try {
            const response = await axios.post(url, body, {
              headers: {
                'Content-Type': 'application/json',
              },
            });
        
            const data = response.data;
        
            console.log('Access Token:', data.access_token);
      
      console.log('Access Token:', response.data.access_token);
      return response.data.access_token;
    } catch (error) {
      console.error('Error obtaining Auth0 management token:', error.response ? error.response.data : error.message);
      throw error;
    }
  }

  async function getMoodleToken() {
    console.log('hello moodle token')
    const url = "https://sassoon.edvantalabs.com/login/token.php";
    
    // Post parameters
    const params = {
      username: "shabrej.ahmad",
      password: "Sassoon@21$",
      service: "sassoon_app",
    };
  
    try {
      // Sending POST request
      const response = await axios.post(url, null, { params });
      
      if (response.data.token) {
        console.log("Token:", response.data.token);
        return response.data.token; // Return the token
      } else {
        console.error("Error fetching token:", response.data);
        return null;
      }
    } catch (error) {
      console.error("Error during token request:", error.message);
      return null;
    }
  }

// Step 3: Create users on Moodle
const createMoodleUsers = async (moodleToken, userData) => {
  const params = {
    wstoken: moodleToken,
    wsfunction: 'local_wssassoon_create_enrol_users',
    users: userData.map((user) => ({
      username: user.email,
      firstname: user.given_name,
      lastname: user.family_name,
      email: user.email,
      auth: 'mo_saml',
    })),
  };

  const apiUrl = `${MOODLE_URL}/webservice/rest/server.php?moodlewsrestformat=json`;
  const response = await axios.post(apiUrl, null, { params });
  return response.data;
};

// Step 4: Import users to Auth0
const importUsersToAuth0 = async (token, filePath) => {
  const form = new FormData();
  form.append('users', fs.createReadStream(filePath));
  form.append('connection_id', AUTH0_CONNECTION_ID);

  const response = await axios.post(
    `https://${AUTH0_DOMAIN}/api/v2/jobs/users-imports`,
    form,
    { headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` } }
  );

  return response.data.id;
};


// Step 5: Send data to Boundless API
const sendDataToBoundlessAPI = async (token, matchedUsers, userData) => {
  for (const user of userData) {
    const matchedUser = matchedUsers.find((u) => u.email === user.email);

    if (matchedUser) {
      const headers = {
        piid: matchedUser.user_id,
        piSessionToken: token,
        apc: 'BDM',
        systemUrl: 'https://pathways.bdm.com',
        sourceSystem: 'Vanderbilt',
      };

      const body = {
        emailid: user.email,
        familyName: user.family_name,
        givenName: user.given_name,
        phoneNumber: user.phoneNumber || '',
        piid: matchedUser.user_id,
        preferredContactMethod: ['SMS', 'Phone', 'Email'],
        utmValue: 'utm_visited=SSO',
      };

      const response = await axios.post(BOUNDLESS_API, body, { headers });
      console.log(`Boundless API response for ${user.email}:`, response.data);
    } else {
      console.log(`No matching user found for email: ${user.email}`);
    }
  }
};

// Step 6: Send email verification
const sendVerificationEmails = async (matchedUsers) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'mail@edvanta.com',
      pass: 'Edvanta@123$', // Use environment variables instead of hardcoding
    },
  });

  for (const user of matchedUsers) {
    const mailOptions = {
      from: 'mail@edvanta.com',
      to: user.email,
      subject: 'Verification Email',
      html: `
        <p>Please verify your email by clicking the link below:</p>
        <a href="http://localhost:3000/verified-users/${user.user_id}">Verify your account</a>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Verification email sent to: ${user.email}`);
  }
};

function getEmailsFromJson(filePath) {
  const fileData = fs.readFileSync(filePath, 'utf8');
  const users = JSON.parse(fileData);
  return users.map(user => user.email); // Assuming each user object has an `email` property
}

// // Filter users based on emails from user.json
const filterUsersByEmails = async (allUsers, filePath) => {
  const userData = await readJSONFile(filePath);
  return allUsers.filter((user) => userData.some((data) => data.email === user.email));
};


// app.post('/upload-users', async (req, res) => {
//   try {
//     // Step 1: Get Moodle Token and User Data
//     const moodleToken = await getMoodleToken();
//     const userData = JSON.parse(await fs.promises.readFile('user.json', 'utf8'));
    
//     // Step 2: Prepare parameters for the Moodle API
//     const params = {
//       wstoken: moodleToken,
//       wsfunction: "local_wssassoon_create_enrol_users",
//       users: [] // Initialize the users array
//     };
    
//     // Use forEach to add all users to the users array
//     userData.forEach((user) => {
//       params.users.push({
//         username: user.email,
//         firstname: user.given_name,
//         lastname: user.family_name,
//         email: user.email,
//         auth: "mo_saml"
//       });
//     });
    
//     const apiUrl = 'https://sassoon.edvantalabs.com/webservice/rest/server.php?moodlewsrestformat=json';
    
//     // Step 3: Make the POST request to Moodle API
//     const moodleResponse = await axios.post(apiUrl, null, { params });
//     console.log('Moodle response:', moodleResponse.data);

    
    
//     // Step 4: Get Auth0 Management Token
//     const token = await getManagementToken();

//     // Step 5: Prepare FormData for Auth0 User Import
//     const form = new FormData();
//     form.append('users', fs.createReadStream('user.json'));
//     form.append('connection_id', 'con_mIZ8kSMehWSugTcY');

//     // Step 6: Initiate the User Import Job on Auth0
//     const response = await axios.post(
//       `https://${AUTH0_DOMAIN}/api/v2/jobs/users-imports`,
//       form,
//       {
//         headers: {
//           ...form.getHeaders(),
//           Authorization: `Bearer ${token}`,
//         },
//       }
//     );

//     const jobId = response.data.id;
//     console.log('User Import Job ID:', jobId);

//     // Step 7: Poll for Job Completion (Optional, depends on your use case)
//     // Implement polling or delay mechanism if you need to wait for job completion

//     // Step 8: Retrieve All Users
//     const allUsers = [];
//     let page = 0;
//     const perPage = 100; // Maximum allowed by Auth0

//     while (true) {
//       const userResponse = await axios.get(
//         `https://${AUTH0_DOMAIN}/api/v2/users`,
//         {
//           params: { page, per_page: perPage },
//           headers: { Authorization: `Bearer ${token}` },
//         }
//       );

//       const users = userResponse.data;
//       allUsers.push(...users);

//       if (users.length < perPage) break;
//       page++;
//     }

//     console.log('All Users:', allUsers);

//     // Step 9: Filter Matched Users by Emails
//     const matchedUsers = await filterUsersByEmails(allUsers, 'user.json');
    
//     const userIds = matchedUsers.map(user => user.email);
//     const axios = require('axios');
// const fs = require('fs');

// // Function to filter users by emails
// async function filterUsersByEmails(allUsers, filePath) {
//   const userData = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
//   return allUsers.filter(user => userData.some(data => data.email === user.email));
// }


//   try {
//  // Replace with your actual session token
//     const allUsers = [
//       // Populate with all users, this should include `user_id` field
//     ];

//     // Match users by email
//     const matchedUsers = await filterUsersByEmails(allUsers, 'user.json');

//     // Read user data
//     const userDataArray = JSON.parse(await fs.promises.readFile('user.json', 'utf8'));

//     // Iterate over userData
//     for (const userData of userDataArray) {
//       const matchedUser = matchedUsers.find(user => user.email === userData.email);

//       if (matchedUser) {
//         const apiUrl = 'https://integrations-dev.boundlesslearning.com/bdm/api/user';

//         const headers = {
//           piid: matchedUser.user_id,
//           piSessionToken: token,
//           apc: 'BDM',
//           systemUrl: 'https://pathways.bdm.com',
//           sourceSystem: 'Vanderbilt',
//         };

//         const body = {
//           emailid: userData.email,
//           familyName: userData.family_name,
//           givenName: userData.given_name,
//           phoneNumber: userData.phoneNumber || '', // Ensure `phoneNumber` is defined
//           piid: matchedUser.user_id,
//           preferredContactMethod: ['SMS', 'Phone', 'Email'],
//           utmValue: 'utm_visited=SSO',
//         };

//         // Make the POST request
//         const salesForceResponse = await axios.post(apiUrl, body, { headers });
//         console.log(`Response for ${userData.email}:`, response.data);
//       } else {
//         console.log(`No matching user found for email: ${userData.email}`);
//       }
//     }
//   } catch (error) {
//     console.error('Error calling API:', error.message);
//   }


//     // Step 10: Create Nodemailer Transporter for Email Sending
//     const transporter = nodemailer.createTransport({
//       service: 'gmail',
//       auth: {
//         user: 'mail@edvanta.com', // Use environment variable for email
//         pass: 'Edvanta@123$', // Use environment variable for email password
//       },
//     });

//     // Step 11: Send Email Verification to Matched Users
//     for (const user of matchedUsers) {
//       const userEmail = user.email;
//       const userId = user.user_id;
//       console.log('data values', userId);
//       try {
//         // Step 1: Send Email Verification
//         const mailOptions = {
//           from: 'mail@edvanta.com',
//           to: userEmail,
//           subject: 'Verification Email',
//           text: 'Please verify your email address by clicking the link below.',
//           html: `
//           <!DOCTYPE html>
//           <html>
//           <head>
//             <meta charset="UTF-8">
//             <meta name="viewport" content="width=device-width, initial-scale=1.0">
//             <title>Verify Your Account</title>
//             <style>
//               body {
//                 font-family: Arial, sans-serif;
//                 margin: 0;
//                 padding: 0;
//                 background-color: #f4f4f4;
//               }
//               .container {
//                 max-width: 600px;
//                 margin: 20px auto;
//                 background: #ffffff;
//                 border-radius: 8px;
//                 overflow: hidden;
//                 box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
//               }
//               .header {
//                 background-color: #222222;
//                 color: #ffffff;
//                 text-align: center;
//                 padding: 20px;
//               }
//               .header img {
//                 max-height: 40px;
//               }
//               .header h1 {
//                 margin: 10px 0;
//                 font-size: 24px;
//               }
//               .content {
//                 padding: 20px;
//                 color: #333333;
//               }
//               .content p {
//                 margin: 10px 0;
//                 line-height: 1.6;
//               }
//               .verify-btn {
//                 display: block;
//                 text-align: center;
//                 margin: 20px auto;
//               }
//               .verify-btn a {
//                 background-color: #f55a2c;
//                 color: #ffffff;
//                 text-decoration: none;
//                 padding: 10px 20px;
//                 border-radius: 5px;
//                 font-size: 16px;
//               }
//               .footer {
//                 font-size: 12px;
//                 text-align: center;
//                 color: #999999;
//                 padding: 20px;
//                 background: #f9f9f9;
//               }
//               .footer a {
//                 color: #999999;
//                 text-decoration: none;
//               }
//             </style>
//           </head>
//           <body>
//             <div class="container">
//               <div class="header">
//                 <img src="https://auth0.com/favicon.ico" alt="Auth0 Logo">
//                 <h1>Verify Your Account</h1>
//               </div>
//               <div class="content">
//                 <p><strong>Verify Link:</strong> <a href="http://localhost:3000/verified-users/${userId}">Click here to verify</a></p>
//                 <div class="verify-btn">
//                   <a href="http://localhost:3000/verified-users/${userId}">VERIFY YOUR ACCOUNT</a>
//                 </div>
//                 <p>If you are having any issues with your account, please don't hesitate to contact us by replying to this mail.</p>
//                 <p>Thanks!</p>
//               </div>
//               <div class="footer">
//                 <p>You’re receiving this email because you have an account in dev-245l7o4d2ki6i2rq. If you are not sure why you’re receiving this, please <a href="mailto:support@example.com">contact us</a>.</p>
//               </div>
//             </div>
//           </body>
//           </html>`
//         };

//         await transporter.sendMail(mailOptions);
//         console.log(`Verification email sent to: ${userEmail}`);
//       } catch (error) {
//         console.error(`Error processing user: ${userEmail}`, error.response?.data || error.message);
//       }
//     }

//     // Respond with success
//     res.status(200).json({
//       message: 'User import and retrieval successful',
//       importedUserIds: userIds,
//       moodleUsers: moodleResponse.data,
//       salesforceusers: salesForceResponse
//     });

//   } catch (error) {
//     console.error('Error uploading users:', error);
//     res.status(500).json({
//       message: 'Failed to upload users',
//       error: error.response ? error.response.data : error.message,
//     });
//   }
// });

// Main route to handle user upload
app.post('/upload-users', async (req, res) => {
  try {
    // Fetch tokens
    const moodleToken = await getMoodleToken();
    const auth0Token = await getManagementToken();

    // Read user data
    const userData = await readJSONFile('user.json');

    // Create users on Moodle
    const moodleUsers = await createMoodleUsers(moodleToken, userData);

    // Import users to Auth0
    const jobId = await importUsersToAuth0(auth0Token, 'user.json');
    console.log('Auth0 Import Job ID:', jobId);

    // Fetch all users from Auth0
    const allUsers = []; // Replace with actual code to fetch Auth0 users
    const matchedUsers = await filterUsersByEmails(allUsers, 'user.json');

    // Send data to Boundless API
    await sendDataToBoundlessAPI(auth0Token, matchedUsers, userData);

    // Send verification emails
    await sendVerificationEmails(matchedUsers);

    res.status(200).json({
      message: 'User upload successful',
      moodleUsers,
      matchedUsers,
    });
  } catch (error) {
    console.error('Error in /upload-users:', error);
    res.status(500).json({ message: 'Error uploading users', error: error.message });
  }
});



// Endpoint to check the status of a user import job
app.get('/verified-users/:userId', async (req, res) => {
  const userId = req.params.userId; // Access userId from URL parameters
  
  const verifyTemplate = (redirectUrl) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Verified</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      font-family: Arial, sans-serif;
      background-color: #ffffff;
    }
    .container {
      text-align: center;
      padding: 20px;
    }
    .circle {
      width: 80px;
      height: 80px;
      border: 4px solid #4CAF50;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 auto 20px auto;
    }
    .checkmark {
      color: #4CAF50;
      font-size: 36px;
      font-weight: bold;
    }
    .title {
      font-size: 24px;
      color: #333333;
      font-weight: bold;
      margin-bottom: 10px;
    }
    .message {
      font-size: 16px;
      color: #666666;
    }
  </style>
  <script>
    setTimeout(() => {
      window.location.href = "${redirectUrl}";
    }, 5000); // Redirect after 5 seconds
  </script>
</head>
<body>
  <div class="container">
    <div class="circle">
      <span class="checkmark">&#10003;</span>
    </div>
    <div class="title">Account Verified!</div>
    <div class="message">Your account has been verified successfully.</div>
  </div>
</body>
</html>
`;

  try {
    // Get the management token
    const token = await getManagementToken();

    // Send the request to Auth0 to generate a password reset ticket
    const passwordResetResponse = await axios.post(
      `https://${AUTH0_DOMAIN}/api/v2/tickets/password-change`,
      { user_id: userId },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Update user's email verification status
    await axios.patch(
      `https://${AUTH0_DOMAIN}/api/v2/users/${userId}`,
      { email_verified: true },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log(`User ${userId} email verified status updated to true.`);

    // Extract the reset ticket URL
    const passwordResetUrl = `${passwordResetResponse.data.ticket}`;

    // Send the verify template with redirection
    res.send(verifyTemplate(passwordResetUrl));
  } catch (error) {
    console.error('Error generating password reset ticket:', error);
    res.status(500).json({
      message: 'Failed to generate password reset URL',
      error: error.response ? error.response.data : error.message,
    });
  }
});




async function getJobErrors(jobId, token) {
  const url = `https://${AUTH0_DOMAIN}/api/v2/jobs/job_PoGy8VnaiLnzJEUU/errors`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    console.log('Job Errors:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error retrieving job errors:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Example usage to retrieve errors
app.get('/job-errors', async (req, res) => {
  try {
    const token = await getManagementToken();
    //const jobId = req.query.jobId; // Assume jobId is passed as a query parameter
    const jobErrors = await getJobErrors('job_PoGy8VnaiLnzJEUU', token);

    res.status(200).json({
      message: 'Job errors retrieved successfully',
      jobErrors,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Failed to retrieve job errors',
      error: error.response ? error.response.data : error.message,
    });
  }
});

app.get('/get-all-users', async (req, res) => {
    try {
      const token = await getManagementToken();
  
      // Make the request to Auth0 to get all users
      const url = `https://${AUTH0_DOMAIN}/api/v2/users`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
  
      // Send the response back to the client with the user data
      res.status(200).json({
        message: 'Users fetched successfully',
        users: response.data,
      });
    } catch (error) {
      console.error('Error fetching users:', error.response ? error.response.data : error.message);
      res.status(500).json({
        message: 'Failed to fetch users',
        error: error.response ? error.response.data : error.message,
      });
    }
  });  

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
