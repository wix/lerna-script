const Repository = require('lerna/lib/Repository'),
  PackageUtilities = require('lerna/lib/PackageUtilities'),
  Package = require('lerna/lib/Package'),
  NpmUtilities = require('lerna/lib/NpmUtilities'),
  execThen = require('exec-then'),
  {join} = require('path'),
  npmlog = require('npmlog');

module.exports.packages = ({log = npmlog} = {log: npmlog}) => loadPackages({log});
module.exports.rootPackage = ({log = npmlog} = {log: npmlog}) => loadRootPackage({log});
module.exports.iter = {forEach, parallel, batched};
module.exports.exec = {command: runCommand, script: runScript};

function forEach(lernaPackages, taskFn) {
  return Promise.resolve().then(() => lernaPackages.forEach(pkg => taskFn(pkg)));
}

function parallel(lernaPackages, taskFn) {
  const packagePromiseFunctions = () => lernaPackages.map(lernaPackage => Promise.resolve().then(() => taskFn(lernaPackage)));
  return Promise.all(packagePromiseFunctions());
}

function batched(lernaPackages, taskFn) {
  const batchedPackages = PackageUtilities.topologicallyBatchPackages(lernaPackages);
  const lernaTaskFn = lernaPackage => done => Promise.resolve()
    .then(() => taskFn(lernaPackage))
    .then(done)
    .catch(done);

  return new Promise((resolve, reject) => {
    PackageUtilities.runParallelBatches(batchedPackages, lernaTaskFn, 4, err => err ? reject(err) : resolve());
  });
}

function runCommand(lernaPackage, {silent = true} = {silent: true}) {
  return command => execThen(command, {cwd: lernaPackage.location, verbose: !silent}).then((res = {}) => {
    if (res.err) {
      return Promise.reject(new Error(`message: '${res.err.message}'\n stdout: ${res.stdout}\n, stderr: ${res.stderr}\n`));
    } else {
      return res.stdout;
    }
  });
}

function runScript(lernaPackage, {silent = true, log = npmlog} = {silent: true, log: npmlog}) {
  return script => {
    if (lernaPackage.scripts && lernaPackage.scripts[script]) {
      return new Promise((resolve, reject) => {
        const callback = (err, stdout) => err ? reject(err) : resolve(stdout);
        if (silent) {
          NpmUtilities.runScriptInDir(script, [], lernaPackage.location, callback);
        } else {
          NpmUtilities.runScriptInPackageStreaming(script, [], lernaPackage, callback)
        }
      });
    } else {
      log.warn('runNpmScript', 'script not found', {script, cwd: lernaPackage.location});
      return Promise.resolve('');
    }

  }
}

function loadPackages({log}) {
  log.verbose('loadPackages');
  return PackageUtilities.getPackages(new Repository());
}

function loadRootPackage({log}) {
  const cwd = process.cwd();
  log.verbose('loadRootPackage', {cwd});
  return new Package(require(join(cwd, './package.json')), cwd);
}