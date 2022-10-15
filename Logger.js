function log(data, type = 'log'){
  if(typeof data === 'object'){
    data = JSON.stringify(data, null, ' ');
  }
  console[type](`[${new Date().toLocaleString()}] Thin-Client-Tools: ${data}`);
}

module.exports = log;