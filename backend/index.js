const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dns = require('dns').promises;
const { Resolver } = require('dns').promises;
const blacklistResolver = new Resolver();
blacklistResolver.setServers(['208.67.222.222', '8.8.8.8', '1.1.1.1']);
const tls = require('tls');
const net = require('net');
const https = require('https');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5001;

// Helper to validate and clean domain input
function cleanDomain(input) {
  if (!input) return '';
  let domain = input.trim().toLowerCase();
  // Remove protocol
  domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
  // Remove paths, query params, etc.
  domain = domain.split('/')[0].split(':')[0];
  // Simple regex check
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
  return domainRegex.test(domain) ? domain : '';
}

// 1. IP Geolocation helper with caching and loopback bypass
const geoCache = {};

async function getIpGeoHelper(ip) {
  if (geoCache[ip]) return geoCache[ip];
  
  if (ip === '8.8.8.8' || ip === '8.8.4.4') {
    return { country: 'United States', countryCode: 'US', org: 'Google LLC' };
  }
  if (ip === '1.1.1.1' || ip === '1.0.0.1') {
    return { country: 'United States', countryCode: 'US', org: 'Cloudflare, Inc.' };
  }
  if (ip === '127.0.0.1' || ip.startsWith('10.') || ip.startsWith('192.168.')) {
    return { country: 'Local Network', countryCode: 'US', org: 'Private IP Address' };
  }

  return new Promise((resolve) => {
    let resolved = false;
    
    // Hard local timeout of 2 seconds to guarantee this promise resolves
    const hardTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`Geolocation query timed out for IP: ${ip}`);
        resolve({ country: 'United States', countryCode: 'US', org: 'Unknown Provider' });
      }
    }, 2000);

    const options = {
      hostname: 'ipapi.co',
      path: `/${ip}/json/`,
      method: 'GET',
      headers: { 'User-Agent': 'nodejs-dns-checker' }
    };

    const req = https.get(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        clearTimeout(hardTimeout);
        if (resolved) return;
        resolved = true;
        try {
          const data = JSON.parse(raw);
          if (data && data.country_name) {
            const result = {
              country: data.country_name,
              countryCode: data.country_code,
              org: data.org || data.asn || 'Unknown Provider'
            };
            geoCache[ip] = result;
            resolve(result);
            return;
          }
        } catch (e) {}
        resolve({ country: 'United States', countryCode: 'US', org: 'Unknown Provider' });
      });
    });

    req.on('error', () => {
      clearTimeout(hardTimeout);
      if (resolved) return;
      resolved = true;
      resolve({ country: 'United States', countryCode: 'US', org: 'Unknown Provider' });
    });
  });
}

// 2. Core DNS lookup logic for single domain
async function lookupDomainRecords(domain, recordTypes = ['A'], resolverInstance = dns) {
  const result = { domain };
  const startTime = Date.now();

  // Ensure A and NS are always resolved behind-the-scenes for table metadata
  const activeRecordTypes = [...recordTypes];
  if (!activeRecordTypes.includes('A')) activeRecordTypes.push('A');
  if (!activeRecordTypes.includes('NS')) activeRecordTypes.push('NS');

  const resolvePromises = activeRecordTypes.map(async (type) => {
    try {
      let data = null;
      switch (type.toUpperCase()) {
        case 'A':
          data = await resolverInstance.resolve4(domain);
          break;
        case 'AAAA':
          data = await resolverInstance.resolve6(domain);
          break;
        case 'MX':
          const mx = await resolverInstance.resolveMx(domain);
          data = mx.map(r => `${r.exchange} (Priority: ${r.priority})`);
          break;
        case 'NS':
          data = await resolverInstance.resolveNs(domain);
          break;
        case 'TXT':
          const txt = await resolverInstance.resolveTxt(domain);
          data = txt.map(r => r.join(' '));
          break;
        case 'CNAME':
          data = await resolverInstance.resolveCname(domain);
          break;
        case 'SOA':
          const soa = await resolverInstance.resolveSoa(domain);
          data = [`NS: ${soa.nsname}, Mail: ${soa.hostmaster}, Serial: ${soa.serial}`];
          break;
        case 'SRV':
          const srv = await resolverInstance.resolveSrv(domain);
          data = srv.map(r => `${r.name}:${r.port} (Priority: ${r.priority}, Weight: ${r.weight})`);
          break;
        case 'CAA':
          const caa = await resolverInstance.resolve(domain, 'CAA');
          data = caa.map(r => `${r.issue ? 'issue' : r.issuewild ? 'issuewild' : 'iodef'}: ${r.value}`);
          break;
        case 'DNSKEY':
          data = await resolverInstance.resolve(domain, 'DNSKEY');
          break;
        case 'DS':
          data = await resolverInstance.resolve(domain, 'DS');
          break;
        default:
          data = [];
      }
      return { type, data, status: 'resolved' };
    } catch (err) {
      return { type, data: [], status: 'error', error: err.code || err.message };
    }
  });

  const resolvedArray = await Promise.all(resolvePromises);
  const records = {};
  let resolvedCount = 0;
  
  resolvedArray.forEach(item => {
    // Only include in final "records" if it was originally requested by the user
    if (recordTypes.includes(item.type)) {
      records[item.type] = item.data;
      if (item.status === 'resolved' && item.data.length > 0) {
        resolvedCount++;
      }
    } else {
      // Store under separate key for hidden details if needed
      records[`_${item.type}`] = item.data;
    }
  });

  // Extract metadata fields for the new screenshot layout table
  let ip = 'N/A';
  let country = 'N/A';
  let countryCode = '';
  let isp = 'N/A';

  const aRecords = records['A'] || records['_A'] || [];
  if (aRecords.length > 0) {
    ip = aRecords[0];
    const geo = await getIpGeoHelper(ip);
    country = geo.country;
    countryCode = geo.countryCode;
    isp = geo.org;
  }

  const ns = records['NS'] || records['_NS'] || [];

  const timeMs = Date.now() - startTime;
  return {
    domain,
    success: resolvedCount > 0 || aRecords.length > 0,
    records,
    ip,
    country,
    countryCode,
    isp,
    ns,
    timeMs
  };
}

// 2. Custom WHOIS client using standard Socket TCP connection
function whoisQuery(domain, host = 'whois.iana.org') {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(43, host, () => {
      socket.write(domain + '\r\n');
    });

    let rawData = '';
    socket.setEncoding('utf8');
    
    socket.on('data', (chunk) => {
      rawData += chunk;
    });

    socket.on('end', () => {
      resolve(rawData);
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.setTimeout(6000, () => {
      socket.destroy();
      reject(new Error('WHOIS query timeout'));
    });
  });
}

async function getWhoisData(domain) {
  try {
    const rawIana = await whoisQuery(domain, 'whois.iana.org');
    // Look for referrals
    const referMatch = rawIana.match(/refer:\s+([a-zA-Z0-9.-]+)/i);
    const whoisMatch = rawIana.match(/whois:\s+([a-zA-Z0-9.-]+)/i);
    const secondaryHost = (referMatch && referMatch[1]) || (whoisMatch && whoisMatch[1]);
    
    if (secondaryHost && secondaryHost.trim() !== 'whois.iana.org') {
      const detailedData = await whoisQuery(domain, secondaryHost.trim());
      return detailedData;
    }
    return rawIana;
  } catch (err) {
    console.error("WHOIS query error:", err);
    const msg = err ? (err.message || err.code || String(err)) : 'Unknown error';
    return `Error retrieving WHOIS data: ${msg}`;
  }
}

// 3. SSL certificate check
function checkSslCertificate(domain) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;

    const socket = tls.connect({
      host: domain,
      port: 443,
      servername: domain,
      rejectUnauthorized: false
    }, () => {
      resolved = true;
      const cert = socket.getPeerCertificate(true);
      const validity = {
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        fingerprint: cert.fingerprint,
        serialNumber: cert.serialNumber,
        authorized: socket.authorized,
        authorizationError: socket.authorizationError
      };

      // Calculate days remaining
      const expiryDate = new Date(cert.valid_to);
      const now = new Date();
      const timeDiff = expiryDate - now;
      const daysRemaining = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      validity.daysRemaining = daysRemaining;
      
      socket.destroy();
      resolve({
        success: true,
        validity,
        timeMs: Date.now() - startTime
      });
    });

    socket.on('error', (err) => {
      if (!resolved) {
        resolve({ success: false, error: err.message, timeMs: Date.now() - startTime });
      }
    });

    socket.setTimeout(5000, () => {
      if (!resolved) {
        socket.destroy();
        resolve({ success: false, error: 'Connection Timeout', timeMs: Date.now() - startTime });
      }
    });
  });
}

// 4. HTTP Headers analyzer
function analyzeHeaders(domain) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const options = {
      method: 'HEAD',
      host: domain,
      port: 443,
      path: '/',
      timeout: 5000,
      rejectUnauthorized: false
    };

    const req = https.request(options, (res) => {
      const headers = res.headers;
      const analysis = {
        'Content-Security-Policy': headers['content-security-policy'] ? 'Present' : 'Missing',
        'Strict-Transport-Security': headers['strict-transport-security'] ? 'Present' : 'Missing',
        'X-Frame-Options': headers['x-frame-options'] ? 'Present' : 'Missing',
        'X-Content-Type-Options': headers['x-content-type-options'] ? 'Present' : 'Missing',
        'Referrer-Policy': headers['referrer-policy'] ? 'Present' : 'Missing',
        'Permissions-Policy': headers['permissions-policy'] ? 'Present' : 'Missing',
        'Server-Header': headers['server'] || 'Not Disclosed'
      };

      // Calculate security score
      let score = 0;
      let maxScore = 6;
      if (headers['content-security-policy']) score++;
      if (headers['strict-transport-security']) score++;
      if (headers['x-frame-options']) score++;
      if (headers['x-content-type-options']) score++;
      if (headers['referrer-policy']) score++;
      if (headers['permissions-policy']) score++;

      let grade = 'F';
      if (score === 6) grade = 'A+';
      else if (score === 5) grade = 'A';
      else if (score === 4) grade = 'B';
      else if (score === 3) grade = 'C';
      else if (score === 2) grade = 'D';

      resolve({
        success: true,
        statusCode: res.statusCode,
        grade,
        score,
        maxScore,
        analysis,
        rawHeaders: headers,
        timeMs: Date.now() - startTime
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message, timeMs: Date.now() - startTime });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Request Timeout', timeMs: Date.now() - startTime });
    });

    req.end();
  });
}

// 5. SMTP Connection checker
async function checkSmtpServer(domain) {
  const startTime = Date.now();
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return { success: false, error: 'No MX records found', timeMs: Date.now() - startTime };
    }
    
    // Sort MX records by priority (lower is higher priority)
    mxRecords.sort((a, b) => a.priority - b.priority);
    const mxHost = mxRecords[0].exchange;

    return new Promise((resolve) => {
      const socket = net.createConnection(25, mxHost);
      let response = '';
      let connected = false;

      socket.setTimeout(5000);
      socket.setEncoding('utf8');

      socket.on('connect', () => {
        connected = true;
      });

      socket.on('data', (chunk) => {
        response += chunk;
        if (response.includes('220')) {
          socket.write('QUIT\r\n');
        }
      });

      socket.on('end', () => {
        resolve({
          success: true,
          mxHost,
          smtpBanner: response.trim().split('\n')[0],
          timeMs: Date.now() - startTime
        });
      });

      socket.on('error', (err) => {
        resolve({
          success: false,
          mxHost,
          error: `SMTP check failed: ${err.message}`,
          timeMs: Date.now() - startTime
        });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({
          success: false,
          mxHost,
          error: 'SMTP connection timeout',
          timeMs: Date.now() - startTime
        });
      });
    });
  } catch (err) {
    return { success: false, error: `MX lookup failed: ${err.message}`, timeMs: Date.now() - startTime };
  }
}

// 6. Blacklist checker
const DNSBL_LISTS = [
  'zen.spamhaus.org', 'bl.spamcop.net', 'dnsbl.sorbs.net', 'b.barracudacentral.org',
  'dnsbl-1.uceprotect.net', 'dnsbl-2.uceprotect.net', 'dnsbl-3.uceprotect.net',
  'all.s5h.net', 'blackholes.mail-abuse.org', 'bl.emailbasura.org',
  'cbl.abuseat.org', 'combined.njabl.org', 'db.wpbl.info',
  'dnsbl.cyberlogic.net', 'dnsbl.inps.de', 'drone.abuse.ch',
  'dul.dnsbl.sorbs.net', 'http.dnsbl.sorbs.net', 'ips.backscatterer.org',
  'ix.dnsbl.manitu.net', 'korea.services.net', 'misc.dnsbl.sorbs.net',
  'no-more-funn.moensted.dk', 'pbl.spamhaus.org', 'proxy.bl.gweep.ca',
  'psbl.surriel.com', 'relays.bl.gweep.ca', 'relays.bl.kundenserver.de',
  'sbl-xbl.spamhaus.org', 'sbl.spamhaus.org', 'smtp.dnsbl.sorbs.net',
  'socks.dnsbl.sorbs.net', 'spam.abuse.ch', 'spam.dnsbl.anonmails.de',
  'spam.dnsbl.sorbs.net', 'spam.spamrats.com', 'spambot.bls.digibase.ca',
  'spamrbl.imp.ch', 'tor.dan.me.uk', 'ubl.lashback.com',
  'ubl.unsubscore.com', 'virbl.bit.nl', 'web.dnsbl.sorbs.net',
  'wormrbl.imp.ch', 'xbl.spamhaus.org', 'zombie.dnsbl.sorbs.net'
];

const majorFriendlyNames = {
  'zen.spamhaus.org': 'Spamhaus ZEN',
  'spam.dnsbl.sorbs.net': 'SORBS Spam',
  'bl.spamcop.net': 'Spamcop',
  'b.barracudacentral.org': 'Barracuda BRBL'
};

async function checkIpBlacklist(ip) {
  const startTime = Date.now();

  // IP must be reversed: e.g. 1.2.3.4 -> 4.3.2.1
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return { success: false, error: 'IPv4 address required for DNSBL checks', timeMs: Date.now() - startTime };
  }
  const reversedIp = parts.reverse().join('.');

  const checks = DNSBL_LISTS.map(async (dnsbl) => {
    try {
      const lookupDomain = `${reversedIp}.${dnsbl}`;
      const ips = await blacklistResolver.resolve4(lookupDomain);
      if (!ips || ips.length === 0) {
        return { list: majorFriendlyNames[dnsbl] || dnsbl, dnsbl, blacklisted: false };
      }
      
      const resultIp = ips[0];
      let blacklisted = false;

      // Filter out query block/refused codes (e.g. 127.255.255.254 or 127.0.0.1 for blocked)
      if (dnsbl.includes('spamhaus.org')) {
        if ((resultIp.startsWith('127.0.0.') || resultIp.startsWith('127.0.1.')) && 
            resultIp !== '127.255.255.252' && 
            resultIp !== '127.255.255.254' && 
            resultIp !== '127.255.255.255') {
          blacklisted = true;
        }
      } else if (dnsbl === 'bl.spamcop.net') {
        if (resultIp === '127.0.0.2') {
          blacklisted = true;
        }
      } else if (resultIp.startsWith('127.')) {
        if (resultIp !== '127.255.255.252' && 
            resultIp !== '127.255.255.254' && 
            resultIp !== '127.255.255.255' && 
            resultIp !== '127.0.0.1') {
          blacklisted = true;
        }
      }

      return { list: majorFriendlyNames[dnsbl] || dnsbl, dnsbl, blacklisted, result: resultIp };
    } catch (err) {
      return { list: majorFriendlyNames[dnsbl] || dnsbl, dnsbl, blacklisted: false };
    }
  });

  const results = await Promise.all(checks);
  return {
    success: true,
    ip,
    results,
    timeMs: Date.now() - startTime
  };
}

// 6.2. Domain Blacklist checker
async function checkDomainBlacklists(domain) {
  const startTime = Date.now();
  const lists = [
    { name: 'Spamhaus DBL', host: 'dbl.spamhaus.org', description: 'Spamhaus Domain Block List' },
    { name: 'SURBL Multi', host: 'multi.surbl.org', description: 'SURBL Multi List' },
    { name: 'URIBL Multi', host: 'multi.uribl.com', description: 'URIBL Multi List' },
    { name: 'SORBS RHSBL', host: 'rhsbl.sorbs.net', description: 'SORBS RHSBL' },
    { name: 'Spam Eating Monkey URIBL', host: 'uribl.spameatingmonkey.net', description: 'Spam Eating Monkey URIBL' },
    { name: 'Spam Eating Monkey Fresh', host: 'fresh.spameatingmonkey.net', description: 'Freshly registered domains (<15 days)' }
  ];

  const checks = lists.map(async (list) => {
    try {
      const lookupDomain = `${domain}.${list.host}`;
      const ips = await blacklistResolver.resolve4(lookupDomain);
      if (!ips || ips.length === 0) {
        return { host: list.host, blacklisted: false };
      }
      const ip = ips[0];
      let blacklisted = false;

      if (list.host === 'dbl.spamhaus.org') {
        if (ip.startsWith('127.0.1.') && ip !== '127.0.1.255') {
          blacklisted = true;
        }
      } else if (list.host === 'multi.uribl.com') {
        if (ip.startsWith('127.0.0.') && ip !== '127.0.0.1') {
          blacklisted = true;
        }
      } else if (list.host === 'multi.surbl.org') {
        if (ip.startsWith('127.0.0.') && ip !== '127.0.0.1') {
          blacklisted = true;
        }
      } else if (list.host === 'rhsbl.sorbs.net') {
        if (ip.startsWith('127.0.0.')) {
          const parts = ip.split('.');
          const lastOctet = parseInt(parts[3], 10);
          if (lastOctet >= 2) {
            blacklisted = true;
          }
        }
      } else if (list.host.includes('spameatingmonkey.net')) {
        if (ip === '127.0.0.2') {
          blacklisted = true;
        }
      } else {
        if (ip.startsWith('127.') && ip !== '127.0.0.1') {
          blacklisted = true;
        }
      }

      return { host: list.host, blacklisted, result: ip };
    } catch (err) {
      return { host: list.host, blacklisted: false };
    }
  });

  const results = await Promise.all(checks);
  return {
    success: true,
    domain,
    results,
    timeMs: Date.now() - startTime
  };
}

// 7. REST APIs
app.post('/api/dns-lookup', async (req, res) => {
  const { domain, recordTypes, dnsServer = '' } = req.body;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain name format' });
  const types = recordTypes || ['A'];
  
  let activeResolver = dns;
  if (dnsServer) {
    try {
      activeResolver = new Resolver();
      activeResolver.setServers([dnsServer]);
    } catch (err) {
      activeResolver = dns;
    }
  }

  try {
    const data = await lookupDomainRecords(clean, types, activeResolver);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reverse-dns', async (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: 'IP parameter is required' });
  try {
    const hostnames = await dns.reverse(ip);
    res.json({ success: true, ip, hostnames });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Parse registrant info from raw WHOIS text
function parseWhoisRegistrant(rawWhois) {
  if (!rawWhois || typeof rawWhois !== 'string') return {};
  
  const extract = (patterns) => {
    for (const pattern of patterns) {
      const match = rawWhois.match(pattern);
      if (match && match[1] && match[1].trim() && !match[1].trim().toLowerCase().includes('redacted')) {
        const val = match[1].trim();
        // Skip privacy-protected values
        if (val.toLowerCase().includes('privacy') || 
            val.toLowerCase().includes('protected') ||
            val.toLowerCase().includes('not disclosed') ||
            val.toLowerCase().includes('data protected') ||
            val.toLowerCase() === 'n/a') {
          continue;
        }
        return val;
      }
    }
    return null;
  };

  return {
    registrantName: extract([
      /Registrant Name:\s*(.+)/i,
      /Registrant:\s*(.+)/i,
      /owner:\s*(.+)/i,
      /holder:\s*(.+)/i,
      /Registrant Contact Name:\s*(.+)/i
    ]),
    registrantOrg: extract([
      /Registrant Organization:\s*(.+)/i,
      /Registrant Organisation:\s*(.+)/i,
      /org-name:\s*(.+)/i,
      /Organization:\s*(.+)/i,
      /Registrant Contact Organisation:\s*(.+)/i
    ]),
    registrantEmail: extract([
      /Registrant Email:\s*(.+)/i,
      /Registrant Contact Email:\s*(.+)/i,
      /e-mail:\s*(.+)/i
    ]),
    registrantCountry: extract([
      /Registrant Country:\s*(.+)/i,
      /Registrant Contact Country:\s*(.+)/i,
      /country:\s*(.+)/i
    ]),
    registrantState: extract([
      /Registrant State\/Province:\s*(.+)/i,
      /Registrant State:\s*(.+)/i
    ]),
    registrar: extract([
      /Registrar:\s*(.+)/i,
      /Sponsoring Registrar:\s*(.+)/i,
      /registrar:\s*(.+)/i
    ]),
    creationDate: extract([
      /Creation Date:\s*(.+)/i,
      /Registration Date:\s*(.+)/i,
      /Created Date:\s*(.+)/i,
      /created:\s*(.+)/i,
      /Registration Time:\s*(.+)/i
    ]),
    expirationDate: extract([
      /(?:Registry )?Expir(?:y|ation) Date:\s*(.+)/i,
      /Expiration Date:\s*(.+)/i,
      /paid-till:\s*(.+)/i,
      /Expiry date:\s*(.+)/i
    ]),
    updatedDate: extract([
      /Updated Date:\s*(.+)/i,
      /Last Updated:\s*(.+)/i,
      /last-modified:\s*(.+)/i,
      /Last Modified:\s*(.+)/i
    ])
  };
}

app.get('/api/whois', async (req, res) => {
  const { domain } = req.query;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain' });
  const data = await getWhoisData(clean);
  const parsed = parseWhoisRegistrant(data);
  res.json({ success: true, domain: clean, data, parsed });
});

app.get('/api/ssl-check', async (req, res) => {
  const { domain } = req.query;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain' });
  const data = await checkSslCertificate(clean);
  res.json(data);
});

app.get('/api/propagation', async (req, res) => {
  const { domain, type = 'A' } = req.query;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain' });

  const servers = [
    { name: 'Local Default', ip: null },
    { name: 'Google DNS (8.8.8.8)', ip: '8.8.8.8' },
    { name: 'Cloudflare DNS (1.1.1.1)', ip: '1.1.1.1' },
    { name: 'OpenDNS (208.67.222.222)', ip: '208.67.222.222' },
    { name: 'Quad9 DNS (9.9.9.9)', ip: '9.9.9.9' }
  ];

  const lookups = servers.map(async (server) => {
    const startTime = Date.now();
    try {
      let r = dns;
      if (server.ip) {
        r = new Resolver();
        r.setServers([server.ip]);
      }
      
      let addresses = [];
      if (type.toUpperCase() === 'A') {
        addresses = await r.resolve4(clean);
      } else if (type.toUpperCase() === 'AAAA') {
        addresses = await r.resolve6(clean);
      } else if (type.toUpperCase() === 'MX') {
        const mx = await r.resolveMx(clean);
        addresses = mx.map(x => `${x.exchange} (${x.priority})`);
      } else if (type.toUpperCase() === 'NS') {
        addresses = await r.resolveNs(clean);
      } else if (type.toUpperCase() === 'TXT') {
        const txt = await r.resolveTxt(clean);
        addresses = txt.map(x => x.join(' '));
      } else {
        addresses = await r.resolve(clean, type.toUpperCase());
      }
      
      return {
        server: server.name,
        dnsIp: server.ip || 'Local Resolver',
        success: true,
        addresses,
        timeMs: Date.now() - startTime
      };
    } catch (err) {
      return {
        server: server.name,
        dnsIp: server.ip || 'Local Resolver',
        success: false,
        addresses: [],
        error: err.code || err.message,
        timeMs: Date.now() - startTime
      };
    }
  });

  const results = await Promise.all(lookups);
  res.json({ domain: clean, recordType: type, results });
});

app.get('/api/email-security', async (req, res) => {
  const { domain, dkimSelector = 'default' } = req.query;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain' });

  // SPF check
  let spf = { found: false, records: [] };
  try {
    const txts = await dns.resolveTxt(clean);
    const spfRecords = txts.map(t => t.join(' ')).filter(r => r.startsWith('v=spf1'));
    if (spfRecords.length > 0) {
      spf = { found: true, records: spfRecords };
    }
  } catch (err) {
    spf.error = err.code || err.message;
  }

  // DMARC check
  let dmarc = { found: false, records: [] };
  try {
    const dmarcTxts = await dns.resolveTxt(`_dmarc.${clean}`);
    const dmarcRecords = dmarcTxts.map(t => t.join(' ')).filter(r => r.startsWith('v=DMARC1'));
    if (dmarcRecords.length > 0) {
      dmarc = { found: true, records: dmarcRecords };
    }
  } catch (err) {
    dmarc.error = err.code || err.message;
  }

  // DKIM check (requires selector)
  let dkim = { found: false, records: [] };
  try {
    const dkimTxts = await dns.resolveTxt(`${dkimSelector}._domainkey.${clean}`);
    const dkimRecords = dkimTxts.map(t => t.join(' '));
    if (dkimRecords.length > 0) {
      dkim = { found: true, records: dkimRecords };
    }
  } catch (err) {
    dkim.error = err.code || err.message;
  }

  // DNSSEC check
  let dnssec = { enabled: false, dnskey: [], ds: [] };
  try {
    const keys = await dns.resolve(clean, 'DNSKEY');
    if (keys && keys.length > 0) {
      dnssec.enabled = true;
      dnssec.dnskey = keys;
    }
  } catch (err) {}

  try {
    const ds = await dns.resolve(clean, 'DS');
    if (ds && ds.length > 0) {
      dnssec.enabled = true;
      dnssec.ds = ds;
    }
  } catch (err) {}

  res.json({ domain: clean, dkimSelector, spf, dmarc, dkim, dnssec });
});

app.get('/api/header-analyzer', async (req, res) => {
  const { domain } = req.query;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain' });
  const data = await analyzeHeaders(clean);
  res.json(data);
});

app.get('/api/smtp-check', async (req, res) => {
  const { domain } = req.query;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain' });
  const data = await checkSmtpServer(clean);
  res.json(data);
});

app.get('/api/blacklist-check', async (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: 'IP address required' });
  const data = await checkIpBlacklist(ip);
  res.json(data);
});

app.get('/api/domain-blacklist-check', async (req, res) => {
  const { domain } = req.query;
  const clean = cleanDomain(domain);
  if (!clean) return res.status(400).json({ error: 'Invalid domain' });
  const data = await checkDomainBlacklists(clean);
  res.json(data);
});

app.get('/api/ip-geo', (req, res) => {
  const { ip } = req.query;
  if (!ip) return res.status(400).json({ error: 'IP is required' });

  // Use ipapi.co for rapid geolocation
  https.get(`https://ipapi.co/${ip}/json/`, (apiRes) => {
    let raw = '';
    apiRes.on('data', c => raw += c);
    apiRes.on('end', () => {
      try {
        res.json(JSON.parse(raw));
      } catch (err) {
        res.json({ success: false, error: 'Could not fetch geo details', raw });
      }
    });
  }).on('error', (err) => {
    res.status(500).json({ success: false, error: err.message });
  });
});

// 8. Socket.IO Real-time Bulk Lookup Processor
io.on('connection', (socket) => {
  console.log(`Socket client connected: ${socket.id}`);

  let isCancelled = false;

  socket.on('start-bulk-dns', async (data) => {
    const { domains = [], recordTypes = ['A'], dnsServer = '', concurrency = 10, delay = 0 } = data;
    isCancelled = false;
    
    // Clean and validate unique domains
    const uniqueDomains = Array.from(new Set(domains.map(d => cleanDomain(d)).filter(Boolean)));
    const total = uniqueDomains.length;
    
    socket.emit('bulk-init', { total, domains: uniqueDomains });

    if (total === 0) {
      socket.emit('bulk-dns-complete', { processed: 0, successful: 0, failed: 0, performance: { avgTimeMs: 0 } });
      return;
    }

    // Configure DNS resolver instance
    let activeResolver = dns;
    if (dnsServer) {
      try {
        activeResolver = new Resolver();
        activeResolver.setServers([dnsServer]);
      } catch (err) {
        socket.emit('bulk-error', `Invalid custom resolver IP: ${dnsServer}. Using default system resolver.`);
        activeResolver = dns;
      }
    }

    let processed = 0;
    let successful = 0;
    let failed = 0;
    let totalTime = 0;
    let index = 0;

    // Parallel queue controller
    async function worker() {
      while (index < uniqueDomains.length && !isCancelled) {
        const currentIdx = index++;
        const domain = uniqueDomains[currentIdx];

        if (delay > 0 && currentIdx > 0) {
          await new Promise(r => setTimeout(r, delay));
        }

        if (isCancelled) break;

        try {
          const result = await lookupDomainRecords(domain, recordTypes, activeResolver);
          processed++;
          if (result.success) {
            successful++;
          } else {
            failed++;
          }
          totalTime += result.timeMs;
          
          socket.emit('bulk-progress', {
            processed,
            successful,
            failed,
            currentResult: result,
            percentage: Math.round((processed / total) * 100)
          });
        } catch (err) {
          processed++;
          failed++;
          socket.emit('bulk-progress', {
            processed,
            successful,
            failed,
            currentResult: { domain, success: false, error: err.message, records: {}, timeMs: 0 },
            percentage: Math.round((processed / total) * 100)
          });
        }
      }
    }

    // Spawn workers
    const numWorkers = Math.min(concurrency, total);
    const workerPromises = Array.from({ length: numWorkers }, () => worker());
    
    await Promise.all(workerPromises);

    socket.emit('bulk-dns-complete', {
      processed,
      successful,
      failed,
      avgTimeMs: processed > 0 ? Math.round(totalTime / processed) : 0
    });
  });

  socket.on('cancel-bulk-dns', () => {
    isCancelled = true;
    socket.emit('bulk-cancelled', 'Operation cancelled by user.');
  });

  socket.on('disconnect', () => {
    isCancelled = true;
    console.log(`Socket client disconnected: ${socket.id}`);
  });
});

// Run Server
server.listen(PORT, () => {
  console.log(`BulkDNS Pro backend server running on port ${PORT}`);
});
