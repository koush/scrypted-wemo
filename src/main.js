const Wemo = require('wemo-client');
const sdk = require('@scrypted/sdk').default;
const {log, deviceManager} = sdk;

Wemo.prototype._listen = function () {
  // no need to start an http server, use the builtin scrypted one.
}

Wemo.prototype.getCallbackURL = function (opts) {
  opts = opts || {};
  if (!this._callbackURL) {
    var host = this.getLocalInterfaceAddress(opts.clientHostname);
    this._callbackURL = `http://${host}:9080/endpoint/@scrypted/wemo/public/callback`;
  }
  log.i(`callbackUrl: ${this._callbackURL}`);
  return this._callbackURL;
}

Wemo.prototype._handleRequest = function (req, res) {
  log.i('incoming request: ' + req.url);
  var body = req.body;
  var udn = req.url.replace('/endpoint/@scrypted/wemo/public/callback', '').substring(1);

  if ((req.method == 'NOTIFY') && this._clients[udn]) {
    log.i(`Incoming Request for ${udn}: ${body}`);
    this._clients[udn].handleCallback(body);
    res.send({
      code: 204
    }, '');
    // res.writeHead(204);
    // res.end();
  } else {
    log.i(`Received request for unknown device: ${udn}`);
    res.send({
      code: 404,
    }, '');
    // res.writeHead(404);
    // res.end();
  }
}

function Device(client, deviceInfo, info) {
  this.client = client;
  this.deviceInfo = deviceInfo;
  this.state = deviceManager.getDeviceState(deviceInfo.UDN);

  this.client.on('binaryState', (state) => this.state.on = state === '1');
}

Device.prototype.turnOn = function () {
  this.client.setBinaryState(1, (err, response) => this.state.on = true);
}
Device.prototype.turnOff = function () {
  this.client.setBinaryState(0, (err, response) => this.state.on = false);
}
Device.prototype.setBrightness = function (level) {
  this.client.setBrightness(level, (err, response) => this.state.brightness = level);
};

var ServiceTypes = {
}
function mapServiceType(serviceType, interfaces, type) {
  ServiceTypes[serviceType] = {
    interfaces,
    type
  }
}
mapServiceType(Wemo.DEVICE_TYPE.Switch, ['OnOff'], 'Outlet');
mapServiceType(Wemo.DEVICE_TYPE.Dimmer, ['OnOff', 'Brightness'], 'Light');
mapServiceType(Wemo.DEVICE_TYPE.LightSwitch, ['OnOff'], 'Light');

function DeviceProvider() {
  var wemo = new Wemo();
  this.wemo = wemo;
  this.devices = {};

  wemo.discover((err, deviceInfo) => {
    log.i(`Wemo Device Found: ${JSON.stringify(deviceInfo)}`);

    // Get the client for the found device
    var client = wemo.client(deviceInfo);

    // You definitely want to listen to error events (e.g. device went offline),
    // Node will throw them as an exception if they are left unhandled  
    client.on('error', (err) => {
      log.e(`Client Error: ${err.code}`);
      delete this.devices[deviceInfo.UDN];

      // reconnect?
    });

    var supportedType = ServiceTypes[deviceInfo.deviceType];
    if (!supportedType) {
      return;
    }

    var interfaces = supportedType.interfaces;
    var events = interfaces.slice();

    var info = {
      name: deviceInfo.friendlyName,
      nativeId: deviceInfo.UDN,
      interfaces: interfaces,
      events: events,
    };

    deviceManager.onDeviceDiscovered(info);
    this.devices[deviceInfo.UDN] = new Device(client, deviceInfo);
  });
}

DeviceProvider.prototype.discoverDevices = function (duration) {
  log.i('discoverDevices was called!');
};

DeviceProvider.prototype.getDevice = function (id) {
  return this.devices[id];
};

DeviceProvider.prototype.getEndpoint = function () {
  return '@scrypted/wemo';
};

DeviceProvider.prototype.onRequest = function (req, res) {
  this.wemo._handleRequest(req, res)
};

export default new DeviceProvider();