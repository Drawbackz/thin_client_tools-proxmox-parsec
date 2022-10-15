const Path = require("path");
const EventEmitter = require("events");
const { spawn } = require('node:child_process');
const log = require("./Logger");
const {sleep} = require("./util");


class ParsecManager extends EventEmitter {

  static EVENTS = {
    OPENED:'parsec_opened',
    CLOSED:'parsec_closed'
  }

  executable;
  autoRestart;
  programName;
  processList;
  constructor({autoRestart, executable}) {
    super();
    this.executable = executable;
    this.autoRestart = autoRestart;
    this.programName = Path.basename(this.executable);
  }

  get isRunning(){
    return this.getRunningInstances();
  }

  getRunningInstances = async () => {
    if(!this.processList){
      this.processList = (await import('ps-list')).default;
    }
    return (await this.processList()).filter((task) => {
      return task.name.toLowerCase() === this.programName;
    });
  }
  waitForExit = async () => {
    while (true){
      const instances = await this.getRunningInstances();
      if(!instances.length){
        this.emit(ParsecManager.EVENTS.CLOSED);
        if(this.autoRestart){
          this.start();
        }
        break;
      }
      await sleep(2500);
    }
  }
  start = async () => {
    const instances = await this.getRunningInstances();
    if(instances.length){
      log('Killing Existing Instances');
      for(const instance of instances){
        log(`Killing Process ${instance.name} With PID ${instance.pid}`);
        process.kill(instance.pid);
      }
    }
    log('Starting Parsec...');
    spawn(this.executable);
    this.emit(ParsecManager.EVENTS.OPENED);
    await this.waitForExit();
  }
}

module.exports = ParsecManager;