'use babel';
/* @flow */

/*
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');

// Although rfc forbids the usage of white space in content type
// (http://www.w3.org/Protocols/rfc2616/rfc2616-sec3.html#sec3.7), it's still
// a common practice to use that so we need to deal with it in regex.
const contentTypeRe = /\s*\w+\/\w+\s*;\s*charset\s*=\s*([^\s]+)\s*/;

function getProtocolModule(url: string): any {
  const {protocol} = require('url').parse(url);
  if (protocol === 'http:') {
    return http;
  } else if (protocol === 'https:') {
    return https;
  } else {
    throw Error(`Protocol ${protocol} not supported`);
  }
}

function getResponseBodyCharset(response: any): ?string {
  const contentType = response.headers['content-type'];
  if (!contentType) {
    return null;
  }
  const match = contentTypeRe.exec(contentType);
  return match ? match[1] : null;
}

module.exports = {

  /**
   * Send Http(s) GET request to given url and return the body as string.
   */
  get(url: string, headers: ?Object): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      const options: Object = require('url').parse(url);
      if (!options.hostname) {
        reject(new Error(`Unable to determine the domain name of ${url}`));
      }
      if (headers) {
        options.headers = headers;
      }
      getProtocolModule(url).get(options, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(`Bad status ${response.statusCode}`);
        } else {
          const charset = getResponseBodyCharset(response);
          if (charset) {
            response.setEncoding(charset);
          }
          response.on('data', data => body += data);
          response.on('end', () => resolve(body));
        }
      }).on('error', reject);
    });
  },

  /**
   * Send Http(s) GET request to given url and save the body to dest file.
   */
  download(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(dest);
      getProtocolModule(url).get(url, (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(`Bad status ${response.statusCode}`);
        } else {
          response.on('error', reject);
          response.pipe(file);
          file.on('error', reject);
          file.on('finish', () => file.close(resolve));
        }
      }).on('error', reject);
    });
  },
};
