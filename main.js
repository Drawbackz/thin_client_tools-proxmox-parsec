process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const originalEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (typeof warning === 'string' && warning.includes('NODE_TLS_REJECT_UNAUTHORIZED')) {
    process.emitWarning = originalEmitWarning
    log('TLS Is Disabled!');
    return;
  }
  return originalEmitWarning.call(process, warning, ...args);
}


const config = require('./config.json');
const {proxmoxApi} = require("proxmox-api");
const ParsecManager = require('./ParsecManager');
const ping = require('ping');
const {sleep} = require('./util');
const log = require("./Logger");

const LOG_TYPE = {
  LOG:'log',
  ERROR:'error',
  WARNING:'warn'
}

const proxmox = proxmoxApi(config.proxmox);
const parsec = new ParsecManager(config.parsec);

let firstRun = true;
parsec.on(ParsecManager.EVENTS.OPENED, () => {
  log('Parsec Running...');
  if(!firstRun){
    log('Parsec Has Restarted!');
  }
  firstRun = false;
});
parsec.on(ParsecManager.EVENTS.CLOSED, () => {
  log('Parsec Closed!');
  if(config.parsec.autoRestart){
    log('Parsec is restarting...');
  }
});

(async () => {
  log('Starting...');
  const targetVM = await getTargetVM(config.proxmox.node.name, config.proxmox.node.vmID);
  const {status} = await getTargetStatus(targetVM);
  log(`Target VM Status: ${status}`);
  if(status === 'stopped'){
    await startTarget(targetVM);
    await sleep(5000);
    await waitForTarget(config.proxmox.node.vmIP);
  }
  if(config.proxmox.autoRestart){
    log(`Automatic Restart Active!`);
    watchVM(targetVM, config.proxmox.node.vmIP);
  }
  parsec.start();
})();

async function startTarget(target){
  log(`Starting Target VM...`);
  await target.status.start.$post();
}
async function waitForTarget(ipAddress){
  log(`Waiting For Host: ${ipAddress}...`);
  let waitAttempts = 0;
  while (true){
    const isAlive = await ping.promise.probe(ipAddress, {timeout:1});
    if(isAlive){
      log(`Host Is Available!`);
      break;
    }
    else{
      log(`Still Waiting${new Array(waitAttempts).fill('.').join('')}`);
    }
  }
}
async function getTargetStatus(target){
  return target.status.current.$get();
}
async function getTargetVM(nodeName, vmID){
  log('Getting Target VM...');
  const hostNodes = await proxmox.nodes.$get(nodeName);
  log('Checking Host Nodes...');
  if(!hostNodes.length){
    log('No Host Nodes Available!', LOG_TYPE.ERROR);
    process.exit(-1);
  }
  log('Host Node(s) Available!');
  log('Checking Host Node Status...');
  let nodeInfo = hostNodes[0];
  const isOnline = nodeInfo.status === 'online';
  log(`Host node is ${nodeInfo.status}!`);
  log(nodeInfo);
  if(!isOnline){process.exit(-2)}
  log('Checking For Target VM...');
  const node = await proxmox.nodes.$(nodeInfo.node);
  const result = node.qemu.$(vmID);
  if(!result){
    log(`Unable To Find Target VM: ${vmID}`);
    process.exit(-3);
  }
  log('Target VM Found!');
  return result;
}
function watchVM(target, vmIP){
  log('Checking VM Status...');
  getTargetStatus(target).then(async ({status}) => {
    if(status === 'stopped'){
      log(`VM Has Stopped!`);
      log(`Restarting VM...`);
      await startTarget(target);
      await sleep(5000);
      await waitForTarget(vmIP);
    }
    else {
      log('VM OK!');
    }
    setTimeout(() => watchVM(target, vmIP), 15000);
  });
}


