const Wemo = require('wemo-client');

Wemo.prototype._listen = function () {
  // no need to start an http server, use the builtin scrypted one.
}

Wemo.prototype.getCallbackURL = function (opts) {
  opts = opts || {};
  if (!this._callbackURL) {
    var host = this.getLocalInterfaceAddress(opts.clientHostname);
    this._callbackURL = `http://${host}:9080/endpoint/@scrypted/wemo/public/callback`;
  }
  return this._callbackURL;
}

Wemo.prototype._handleRequest = function (req, res) {
  var body = req.body;
  var udn = req.url.replace('/endpoint/@scrypted/wemo/public/callback', '').substring(1);

  if ((req.method == 'NOTIFY') && this._clients[udn]) {
    // debug('Incoming Request for %s: %s', udn, body);
    this._clients[udn].handleCallback(body);
    res.send({
      code: 204
    }, null)
    // res.writeHead(204);
    // res.end();
  } else {
    // debug('Received request for unknown device: %s', udn);
    res.send({
      code: 404,
    })
    // res.writeHead(404);
    // res.end();
  }
}

function Device(client, deviceInfo, info) {
  this.client = client;
  this.deviceInfo = deviceInfo;
  this.state = {};

  this.client.on('binaryState', (state) => this.onEvent('OnOff', null, null, state === '1'));
}

Device.prototype.onEvent = function(event, err, response, data) {
  if (!err) {
    this.state[event] = data;
    deviceManager.onDeviceEvent(this.deviceInfo.UDN, event, data)
  }
}

Device.prototype.turnOn = function () {
  this.client.setBinaryState(1, (err, response) => this.onEvent('OnOff', err, response, true));
}
Device.prototype.turnOff = function () {
  this.client.setBinaryState(0, (err, response) => this.onEvent('OnOff', err, response, false));
}
Device.prototype.isOn = function () {
  return this.state.OnOff || false;
}
Device.prototype.getLevel = function () {
  return this.state.Brightness || 0;
};
Device.prototype.setLevel = function (level) {
  this.client.setBrightness(level, (err, response) => this.onEvent('Brightness', err, response, level));
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
    console.log(`Wemo Device Found: ${JSON.stringify(deviceInfo)}`);

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

    this.devices[deviceInfo.UDN] = new Device(client, deviceInfo);
    var info = {
      name: deviceInfo.friendlyName,
      id: deviceInfo.UDN,
      interfaces: interfaces,
      events: events,
    };

    deviceManager.onDeviceDiscovered(info);
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