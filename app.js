require('dotenv').config();
const express = require('express');
const fs = require("fs");
const http = require('http');
const urlParser = require("url");
const urlRegex = require("url-regex");
const crypto = require("crypto");
const app = express();
const port = 3000;

let bracketsData = '';
const sha256Hasher = crypto.createHmac("sha256", process.env.IM_SECRET);

const fileUrl = process.argv[process.argv.length-1];

let start = readProvidedFile(fileUrl);

function readProvidedFile(fileUrl) {
  fs.readFile(fileUrl, 'utf8', function (err,data) {
    if (err) {
      return console.log('error reading provided file', err);
    }
    filterData(data);
  });
}

/*
app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`)
})
*/

function filterData(data) {
  let lbCount = 0;
  let lbPositions = [];
  let rbCount = 0;
  let rbPositions = [];
  let ignoreCount = 0;
  let ignorePos = [];
  let counter = 0;
  for (i = counter; i < data.length; i++) {
      let testChar = data.charAt(i);
      if (testChar === '\[') { lbCount++, lbPositions.push(i) }
      else if (testChar === '\]') { rbCount++, rbPositions.push(i) }
      else if (testChar === '\\') {
          ignoreCount++;
          if (data.charAt(i + 1) === '\[') {
              ignorePos.push(i + 1);
          };
      }
      if (((lbCount > 0) || (rbCount > 0)) && (lbCount === rbCount)) { // something inside closed []
          if (ignoreCount > 0) { // has escape?
              if (lbPositions[0] == ignorePos[0]) { // has escape! ignore it!
                  ignoreCount--;
                  ignorePos.shift();
                  lbCount = 0;
                  rbCount = 0;
                  lbPositions = [];
                  rbPositions = [];
              }
          } else if (lbCount > 1) { // nested txt
              // let tempString = data.substring(lbPositions[0], rbPositions[rbPositions.length - 1]);
              while (lbPositions.length > 1) {
                  if ((ignoreCount > 0) && (lbPositions[0] == ignorePos[0])) { // if ignore pos
                      console.log('ignor pos');
                      ignoreCount--;
                      lbCount = 0;
                      rbCount = 0;
                      lbPositions = [];
                      rbPositions = [];
                  } else { // if not ignore pos
                      let firstCut = data.substring(lbPositions[0] + 1, lbPositions[1]);
                      let secondCut = data.substring(rbPositions[rbPositions.length - 2] + 1, rbPositions[rbPositions.length - 1]);
                      newString = firstCut.concat(" ", secondCut);
                      bracketsData = bracketsData.concat(newString);
                      lbPositions = [];
                      rbPositions = [];
                      lbCount = 0;
                      rbCount = 0;
                  }
              }
          } else if (lbCount == 1) { // simple nested 
              bracketsData = bracketsData.concat(data.substring(lbPositions[0] + 1, rbPositions[0]));
              lbPositions.pop();
              rbPositions.shift();
              lbCount = 0;
              rbCount = 0;
          }
      }
  }
  detectUrls(bracketsData);
}

function detectUrls(str) {
  var urlList = str.match(urlRegex());
  let urlsToVisit = [];
  urlList.forEach(url => {
      // this check needs improving
      if (url.substring(0, 4) !== 'http')  {
          url = 'http://'.concat(url);
      }
      let parsed = urlParser.parse(url, false);
      if (parsed.hostname === null) {
          parsed.hostname = '/';
      }
      urlsToVisit.push(
          {
            hostname: parsed.hostname,
            path: parsed.pathname,
            port: 80,
            method: 'GET'
          }
      )
  });
  // console.log('urls to visit: ', urlsToVisit);
  if (urlsToVisit.length > 0) {
  sendRequests(urlsToVisit, true);
  } else {
    process.stdout.write('no urls detected');
  }

}

function sendRequests(urlsToVisit, firstCheck) {
  if (firstCheck) {
    htmlRequest(urlsToVisit[0], true);
    urlsToVisit.shift();
    if (urlsToVisit.length > 0) {
      setTimeout(function() {
        sendRequests(urlsToVisit, true);
      }, 1000);
    }
  }

}

function htmlRequest(urlData, firstCheck) {
  const req = http.request(urlData, res => {
      var bodyChunks = [];
      res.on('data', d => {
        bodyChunks.push(d);
      }).on('end', function() {
          let body = Buffer.concat(bodyChunks);
          processResponse(body.toString(), urlData.hostname);
        })
    })
    req.on('error', error => {
      // console.error(error)
      if (firstCheck) {
        process.stdout.write('unable to connect to site: ');
        process.stdout.write(urlData.hostname+', will try again in 60 seconds\n');
        setTimeout(function() {
          htmlRequest(urlData, false);
        }, 60000);
      } else {
        process.stdout.write('unable to connect to site: ');
        process.stdout.write(urlData.hostname+'\n');
      }
    })
    req.end();
}

function processResponse(data, url) {
  let result = {url: url};
  let titleMatch = data.match(/<title>.+?<\/title>/ig);
  let email = '';
  if (titleMatch && titleMatch[0].length > 14) { 
      result.title = titleMatch[0].substring(7,titleMatch[0].length-8);
  }; 
  var re = /[a-zA-Z0-9._-]{3,}@[a-zA-Z0-9.-]{3,}\.[a-zA-Z]{2,4}/im;
  let res=re.exec(data);
  if (res) {
      email = res[0];
      const hashedEmail = sha256Hasher.update(email).digest("hex");
      result.email = hashedEmail;
  }
  process.stdout.write(JSON.stringify(result)+'\n');
}