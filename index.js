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
app.post('/upload-users', async (req, res) => {
  try {
    // Get the Auth0 Management API Token
    const token = await getManagementToken();

    // Prepare FormData with the CSV file
    const form = new FormData();
    form.append('users', fs.createReadStream('user.json'));
    form.append('connection_id', 'con_mIZ8kSMehWSugTcY');

    // Make the request to Auth0 API
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

    // Send response back to the client
    res.status(200).json({
      message: 'User import job created successfully',
      res: response.data,
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
