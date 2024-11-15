const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const app = express();


// Set your Auth0 details here
const AUTH0_DOMAIN = 'dev-245l7o4d2ki6i2rq.us.auth0.com';
const AUTH0_CLIENT_ID = '1Nhvu4Bnr3ki2pDStNah31Z9QiPuorfs';
const AUTH0_CLIENT_SECRET = '8kJM-Ksh8ovMKLMXOMy9zrh8V5ESzCcPF8WMKeYjU96RH0exwnEXQhL2RkIalpMT';

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


// API endpoint for bulk user upload
// app.post('/upload-users', async (req, res) => {
//   try {
//     // Get the Auth0 Management API Token
//     const token = await getManagementToken();

//     // Prepare FormData with the CSV file
//     const form = new FormData();
//     form.append('users', fs.createReadStream('user.json'));
//     form.append('connection_id', 'con_mIZ8kSMehWSugTcY');

//     // Import users via Auth0 API
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

//     // Get job ID to track import completion if needed
//     const jobId = response.data.id;

//     console.log('job id',jobId);

//     // Optionally wait for the import job to complete, then send verification emails
//     // Loop over each imported user and send the verification email
//     const users = JSON.parse(fs.readFileSync('user.json'));
//     for (const user of users) {
//       await axios.post(
//         `https://${AUTH0_DOMAIN}/api/v2/jobs/verification-email`,
//         {
//           user_id: user.user_id, // Add or map user_id based on Auth0 import results
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${token}`,
//           },
//         }
//       );
//     }

//     res.status(200).json({
//       message: 'User import and verification emails sent successfully',
//       res: response.data,
//     });
//   } catch (error) {
//     console.error('Error uploading users:', error);
//     res.status(500).json({
//       message: 'Failed to upload users',
//       error: error.response ? error.response.data : error.message,
//     });
//   }
// });

function getEmailsFromJson(filePath) {
  const fileData = fs.readFileSync(filePath, 'utf8');
  const users = JSON.parse(fileData);
  return users.map(user => user.email); // Assuming each user object has an `email` property
}

// Filter users based on emails from user.json
async function filterUsersByEmails(allUsers, filePath) {
  const emailsFromJson = getEmailsFromJson(filePath);
  return allUsers.filter(user => emailsFromJson.includes(user.email));
}
app.post('/upload-users', async (req, res) => {
  try {
    const token = await getManagementToken();

    // Step 1: Prepare FormData and initiate user import
    const form = new FormData();
    form.append('users', fs.createReadStream('user.json'));
    form.append('connection_id', 'con_mIZ8kSMehWSugTcY');

    const response = await axios.post(
      `https://${AUTH0_DOMAIN}/api/v2/jobs/users-imports`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const jobId = response.data.id;

    // Step 2: Wait for import job completion (Optional: Polling implementation)
    // Implement polling or a delay to allow time for the import to complete if needed

    // Step 3: Retrieve imported users based on the connection_id
    const allUsers = [];
    let page = 0;
    const perPage = 100; // Maximum allowed by Auth0

    while (true) {
      const response = await axios.get(
        `https://${AUTH0_DOMAIN}/api/v2/users`,
        {
          params: { page, per_page: perPage },
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const users = response.data;
      allUsers.push(...users);

      // Break if there are no more users to fetch
      if (users.length < perPage) break;

      // Move to the next page
      page++;
    }

    console.log('allUsers',allUsers )
    const matchedUsers = await filterUsersByEmails(allUsers, 'user.json');
    // Get user IDs
  
    const userIds = matchedUsers.map(user => user.user_id); // Assuming user objects have a `user_id` property
    console.log('Matched User IDs:', userIds);


    for (const userId of userIds) {
      // Step 1: Send Email Verification
      try {
        await axios.post(
          `https://${AUTH0_DOMAIN}/api/v2/jobs/verification-email`,
          {
            user_id: userId,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
    
        console.log(`Verification email sent to user: ${userId}`);
    
        // Step 2: Send Password Reset Email
        const passwordResetResponse = await axios.post(
          `https://${AUTH0_DOMAIN}/api/v2/tickets/password-change`,
          {
            user_id: userId,
            // result_url: 'https://your-app-domain.com/reset-successful', // Redirect URL after password reset
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
    
        console.log(
          `Password reset email sent to user: ${userId}, ticket URL: ${passwordResetResponse.data.ticket}`
        );
      } catch (error) {
        console.error(`Error processing user: ${userId}`, error.response?.data || error.message);
      }
    }
    
    res.status(200).json({
      message: 'User import and retrieval successful',
      importedUserIds: matchedUsers,
    });
  } catch (error) {
    console.error('Error uploading users:', error);
    res.status(500).json({
      message: 'Failed to upload users',
      error: error.response ? error.response.data : error.message,
    });
  }
});



// Function to check job status
async function checkJobStatus(jobId, token) {
    const url = `https://${AUTH0_DOMAIN}/api/v2/jobs/job_PoGy8VnaiLnzJEUU`;
  
    try {
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data;
    } catch (error) {
      console.error('Error checking job status:', error.response ? error.response.data : error.message);
      throw error;
    }
  }
  
  // Endpoint to check the status of a user import job
  app.get('/check-import-status', async (req, res) => {
    try {
      const token = await getManagementToken(); // Retrieve the management token
      //const jobId = req.query.jobId; // Assume jobId is passed as a query parameter
      const jobStatus = await checkJobStatus('job_PoGy8VnaiLnzJEUU', token);
  
      res.status(200).json({
        message: 'Job status retrieved successfully',
        jobStatus,
      });
    } catch (error) {
      console.error('Error retrieving job status:', error);
      res.status(500).json({
        message: 'Failed to retrieve job status',
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
