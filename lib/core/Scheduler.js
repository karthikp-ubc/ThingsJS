var EventEmitter = require('events').EventEmitter;
var fs = require('fs');
var Dispatcher = require('./Dispatcher.js');
var helpers = require('../helpers.js');
var chalk = require('chalk');

var DEBUG = true;

/**
 * **[Stability - Experimental]**
 * A Scheduler monitors CodeEngine and Program instances on the network, triggering live-migration of a Process if needed.
 * Scheduler is a subclass of Dispatcher.
 * @constructor
 * @param {Object} config [description]
 */
function Scheduler(config, options){
	if (!(this instanceof Scheduler)) return new Scheduler(config);
	config = Object.assign(config, {
		id: (config.id || 'things-scheduler')
	});
	options = Object.assign({
		log_path: null
	}, options);
	Dispatcher.call(this, config);
	var self = this;

	self.state = {
		apps: {}
	};
	self.history = [];
	self.queue = [];

	this.pubsub.subscribe(this.id+'/cmd', function(message){
		if (message.ctrl in Scheduler.Behaviours){
			Scheduler.Behaviours[message.ctrl](self, message.kwargs)
				.then(function(result){
					// console.log(result);

					if (message.request_id && message.reply_to){
						self.pubsub.publish(message.reply_to, {
							reply_id: message.request_id,
							payload: result
						})
					}
				}, function(err){
					console.log(err);
				});
		}
		else if (message.reply_id){
			self._requests[message.reply_id].resolve(message.payload);
			clearTimeout(self._requests[message.reply_id].timer);
			delete self._requests[message.reply_id];
		}
		else {
			console.log(chalk.red('[Scheduler:'+self.id+'] Received unexpected message'));
		}
	});

	if (options.log_path){
		console.log('[Scheduler:'+self.id+'] Logging at '+options.log_path);
		self.logging = {};
		self.on('engine-join', function(engine, message){
			if (!(engine.id in self.logging)){
				console.log('Subscribing to Engine '+engine.id);
				self.pubsub.subscribe(engine.id+'/resource', (stat)=>{
					fs.appendFile(options.log_path, [
							'Engine',
							engine.id,
							stat.timestamp,
							stat.cpu,
							stat.memory.rss,
							stat.memory.heapUsed,
							stat.memory.heapTotal,
							stat.memory.external
						].join(',')+'\n', (err)=>{
						if (err) console.log('Error appending log ', err);
						// else console.log('[Engine] '+engine.id+'\t'+stat.cpu.toFixed(1)+'%\t'+(stat.memory.rss/1000000).toFixed(1)+'MB');
					})
				})
			}
		});
		self.on('program-join', function(program, message){
			if (!(program.id in self.logging)){
				console.log('Subscribing to Program '+program.id);
				self.pubsub.subscribe(program.code_name+'/'+program.id+'/resource', (stat)=>{
					fs.appendFile(options.log_path, [
							'Program',
							program.code_name+'.'+program.id,
							stat.timestamp,
							stat.cpu,
							stat.memory.rss,
							stat.memory.heapUsed,
							stat.memory.heapTotal,
							stat.memory.external
						].join(',')+'\n', (err)=>{
						if (err) console.log('Error appending log ', err);
						// else console.log('[Program] '+program.code_name+'.'+program.id+'\t'+stat.cpu.toFixed(1)+'%\t'+(stat.memory.rss/1000000).toFixed(1)+'MB');
					})
				})
			}
		});
	}

	self.on('engine-registry-update', function(engine, message){
		// console.log('Engine Registry Updated', engine.id);
		// console.log(message);
		self.logEvent('engine-registry-update', {
			engine: engine.id,
			status: engine.status,
			eventName: message.eventName,
			codes: engine.codes
		});
	});
	self.on('program-monitor-update', function(program, message){
		// console.log('Program Monitor Updated', program.code_name+':'+program.id);
		self.logEvent('program-monitor-update', {
			code_name: program.code_name,
			instance_id: program.id,
			engine: program.engine,
			status: program.status,
			eventName: message.eventName
		});
	});

	self.logEvent('scheduler-event', {
		phase: 'boot'
	});

	setInterval(function(){
		self.invoke();
	}, 10000);
}
Scheduler.prototype = Object.create(Dispatcher.prototype);
Scheduler.prototype.constructor = Scheduler;

Scheduler.prototype.ackedPublish = function(topic, ctrl, kwargs){
	var self = this;
	var deferred = helpers.defer();
	var request_id = helpers.randKey(16);
	self._requests[request_id] = deferred;

	self.pubsub.publish(topic, {
		request_id: request_id,
		reply_to: self.id+'/cmd',
		ctrl: ctrl,
		kwargs: kwargs
	})
	deferred.timer = setTimeout(function(){
		if (request_id in self._requests){
			deferred.reject('PubsubCommandTimeout');
			delete self._requests[request_id];
		}
	}, 10000); // assume failure if reply not received
	return deferred.promise
}

Scheduler.prototype.logEvent = function(type, data){
	var event = {
		key: helpers.randKey(16),
		timestamp: Date.now(),
		type: type,
		data: data
	};
	this.history.push(event);
	if (this.history.length > 1000) this.history.shift();
	// console.log(event);
	this.pubsub.publish(this.id+'/events', event);
}
Scheduler.prototype.reportStatus = function(){
	this.pubsub.publish(this.id+'/state', this.state);
}
Scheduler.prototype.run_application = function(kwargs){
	return Scheduler.Behaviours.run_application(this, kwargs);
}
Scheduler.prototype.pause_application = function(kwargs){
	return Scheduler.Behaviours.pause_application(this, kwargs);
}
Scheduler.prototype.resume_application = function(kwargs){
	return Scheduler.Behaviours.resume_application(this, kwargs);
}
Scheduler.prototype.kill_application = function(kwargs){
	return Scheduler.Behaviours.kill_application(this, kwargs);
}

Scheduler.prototype._assess = function(){
	var self = this;
	return new Promise(function(resolve, reject){
		var queue = self.queue;
		self.queue = [];

		var tasks = [];
		queue.forEach(function(request){
			for (var i=0; i < request.count; i++){
				tasks.push({
					id: request.code_name+':'+i,
					code_name: request.code_name,
					source: request.source,
					required_memory: 40,
					token: request.token
				})
			}
		});

		var mapping = {};
		Object.values(self.engines).forEach(function(engine){
			if (engine.status !== 'dead'){
				var stat = engine.getStat();
				// engine.available_memory = stat ? (stat.device_memory / 1000000) : 0;
				engine.available_memory = stat ? stat.memory_limit : 0;
				console.log('Engine '+engine.id+' '+engine.available_memory);
				// Object.values(engine.codes)
				// 	.forEach((obj)=>{
				// 		Object.keys(obj)
				// 			.forEach((instance_id)=>{
				// 				self.programs[instance_id]
				// 			})
				// 	})

				mapping[engine.id] = {
					available_memory: engine.available_memory,
					processes: {}
				};
			}
		});

		Object.values(self.programs).forEach(function(proc){
			if (proc.engine && self.engines[proc.engine].status !== 'dead'){
				var stat = proc.getStat();
				mapping[proc.engine].processes[proc.id] = {
					id: proc.id,
					code_name: proc.code_name,
					status: proc.status,
					resource: stat,
					required_memory: 5
				};
				if (stat) mapping[proc.engine].available_memory -= (stat.memory.rss / 1000000);
			}
		});

		self.logEvent('scheduler-event', {
			phase: 'invoke',
			mapping: mapping
		});

		resolve({
			engines: Object.values(self.engines)
						.filter(function(engine){ return engine.status !== 'dead' }),
			mapping: mapping,
			tasks: tasks
		})

	});
}
Scheduler.prototype._compute = function(state){
	var self = this;
	return new Promise(function(resolve, reject){
		// console.log('Current Mapping', state.mapping);
		try {
			var new_mapping = Scheduler.Algorithms['first_fit'](state.engines, state.tasks, state.mapping);	
			// console.log('New Mapping', new_mapping);

			var actions = Scheduler.computeActions(state.mapping, new_mapping);

			// self.logEvent('scheduler-event', {
			// 	phase: 'compute',
			// 	mapping: new_mapping
			// });

			resolve({
				prev_mapping: state.mapping,
				mapping: new_mapping,
				actions: actions
			});
		}
		catch (e){
			if (e.code === 'SchedulerNoSolutionError'){
				resolve({
					prev_mapping: state.mapping,
					mapping: helpers.deepCopy(state.mapping),
					actions: []
				})
			}
			else throw e;
		}
	});
}
Scheduler.prototype._apply = function(kwargs){
	// this.logEvent('scheduler-event', {
	// 	phase: 'apply',
	// 	actions: result.actions
	// });
	return this.applyActions(kwargs.actions)
		.then(function(results){
			var actions = kwargs.actions.map(function(action, index){
				return {
					type: action.type,
					args: action.args,
					result: results[index]
				}
			})
			kwargs.actions = actions;
			return kwargs;
		})
}

Scheduler.prototype.invoke = function(){
	var self = this;
	(DEBUG && console.log(chalk.red('[Scheduler] Invoke start')));

	// self.logEvent('scheduler-event', {
	// 	phase: 'invoke'
	// });
	
	// Note: _assess and _compute can actually be done synchronously, but implemented as an asynchronous function (Promise) in case we switch to a distributed algorithm (which would be fundamentally asynchronous)
	return self._assess()
		.then(function(state){
			console.log(chalk.magenta('[Scheduler] Assessed'));
			Object.keys(state.mapping).forEach((engine_id)=>{
				var eng = state.mapping[engine_id];;
				console.log('Engine '+engine_id+' : '+eng.available_memory+', '+Object.keys(eng.processes).length+' procs');
			})
			return self._compute(state)
		})
		.then(function(actions){
			// console.log(chalk.magenta('[Scheduler] Computed'), actions);
			return self._apply(actions)
		})
		.then(function(result){
			// console.log(chalk.magenta('[Scheduler] Applied'), result);
			self.logEvent('scheduler-event', {
				phase: 'resolve',
				prev_mapping: result.prev_mapping,
				mapping: result.mapping,
				actions: result.actions
			});
			(DEBUG && console.log(chalk.green('[Scheduler] Invoke finished')))
			return result;
		})
}

Scheduler.Behaviours = {
	'run_application': function(self, kwargs){
		(DEBUG && console.log(chalk.red('[Scheduler] Run Application Requested')));
		// console.log(kwargs);

		var trx_token = helpers.randKey();

		Object.keys(kwargs.components).forEach(function(code_name){
			self.queue.push({
				code_name: code_name,
				source: kwargs.components[code_name].source,
				count: kwargs.components[code_name].count,
				token: trx_token
			});
		});

		return self.invoke()
			.then(function(result){
				(DEBUG && console.log(chalk.green('[Scheduler] Run Application Successfully Finished')));
				// console.log(result);
				self.state.apps[trx_token] = {
					name: kwargs.name,
					status: 'Running',
					startedAt: Date.now(),
					procs: result.actions.map(function(action){ return action.result })
				}
				// console.log(self.state);
				self.reportStatus();

				return {
					token: trx_token
				}
				// return result;
			})
			.catch(function(error){
				return {
					result: 'failure',
					message: 'No Schedule Found'
				}
			})
	},
	'pause_application': function(self, kwargs){
		(DEBUG && console.log(chalk.red('[Scheduler] Pause Application Requested')));
		// console.log(kwargs);

		var trx_token = kwargs.token;

		// find components with token and pause them
		if (trx_token in self.state.apps){
			var app = self.state.apps[trx_token];
			if (app.status === 'Running'){
				var actions = app.procs.map(function(proc){
					return {
						type: 'pause',
						args: [ proc.id ]
					}
				});

				return self._apply({ actions: actions })
					.then(function(result){
						(DEBUG && console.log(chalk.green('[Scheduler] Paused Application')));
						// console.log(result);
						app.status = 'Paused';
						self.reportStatus();

						return {
							token: trx_token,
							name: app.name,
							status: app.status
						}
					})

			}
			else {
				return Promise.reject({
					message: 'Application is in "'+app.status+'" state'
				})
			}
		}
		else {
			return Promise.reject({
				message: 'Application with key "'+trx_token+'" Not found'
			})
		}
	},
	'resume_application': function(self, kwargs){
		(DEBUG && console.log(chalk.red('[Scheduler] Resume Application Requested')));
		// console.log(kwargs);

		var trx_token = kwargs.token;

		// find components with token and pause them
		if (trx_token in self.state.apps){
			var app = self.state.apps[trx_token];
			if (app.status === 'Paused'){
				var actions = app.procs.map(function(proc){
					return {
						type: 'resume',
						args: [ proc.id ]
					}
				});

				return self._apply({ actions: actions })
					.then(function(result){
						(DEBUG && console.log(chalk.green('[Scheduler] Resumed Application')));
						// console.log(result);
						app.status = 'Running';
						self.reportStatus();

						return {
							token: trx_token,
							name: app.name,
							status: app.status
						}
					})

			}
			else {
				return Promise.reject({
					message: 'Application is in "'+app.status+'" state'
				})
			}
		}
		else {
			return Promise.reject({
				message: 'Application with key "'+trx_token+'" Not found'
			})
		}
	},
	'kill_application': function(self, kwargs){
		(DEBUG && console.log(chalk.red('[Scheduler] Kill Application Requested')));
		// console.log(kwargs);

		var trx_token = kwargs.token;

		// find components with token and pause them
		if (trx_token in self.state.apps){
			var app = self.state.apps[trx_token];
			if (app.status !== 'Exited'){
				var actions = app.procs.map(function(proc){
					return {
						type: 'kill',
						args: [ proc.id ]
					}
				});

				return self._apply({ actions: actions })
					.then(function(result){
						(DEBUG && console.log(chalk.green('[Scheduler] Killed Application')));
						// console.log(result);
						app.status = 'Exited';
						self.reportStatus();

						return {
							token: trx_token,
							app: app
						}

						// self.logEvent('scheduler-event', {
						// 	phase: 'resolve',
						// 	prev_mapping: result.prev_mapping,
						// 	mapping: result.mapping,
						// 	actions: result.actions
						// });
						// (DEBUG && console.log(chalk.green('[Scheduler] Invoke finished')))
						return result;
					})

			}
			else {
				return Promise.reject({
					message: 'Application is in "'+app.status+'" state'
				})
			}
		}
		else {
			return Promise.reject({
				message: 'Application with key "'+trx_token+'" Not found'
			})
		}
	},
	'report': function(self, kwargs){
		(DEBUG && console.log(chalk.red('[Scheduler] Report State Requested')));
		return Promise.resolve(self.state)
	}
}

// Quick and dirty way to make custom error (only sets the .code property)
function SchedulerNoSolutionError(message){
	var e = new Error(message) ;
	e.code = 'SchedulerNoSolutionError';
	return e;
}

/**
 * Scheduler Algorithms - all functions should accept devices, tasks, mapping as arguments
 * @param {Array} devices - [{ id, available_memory }]
 * @param {Array} tasks - [{ id, required_memory }]
 * @param {Object} [cur_mapping] - Current mapping
 */
Scheduler.Algorithms = {
	'first_fit': function(devices, tasks, cur_mapping){
		if (devices.length < 1) throw SchedulerNoSolutionError("No devices found, no solution found using [first_fit] Algorithm");
		// devices = devices.sort(function(a, b){ return b.available_memory - a.available_memory });
		tasks = tasks.sort(function(a, b){ return b.required_memory - a.required_memory });

		var mapping = {};
		devices.forEach(function(device){
			mapping[device.id] = {
				// available_memory: device.available_memory,
				processes: {}
			}
		});

		Object.keys(cur_mapping).forEach(function(device_id){
			if (device_id in mapping){
				mapping[device_id].available_memory = cur_mapping[device_id].available_memory;
				mapping[device_id].processes = helpers.deepCopy(cur_mapping[device_id].processes);
			}
		});

		tasks.forEach(function(task){
			var most_space = Object.keys(mapping).reduce(function(acc, id){
				return (mapping[id].available_memory > mapping[acc].available_memory) ? id : acc;
			}, devices[0].id);

			if (mapping[most_space].available_memory > task.required_memory){
				mapping[most_space].available_memory -= task.required_memory;
				mapping[most_space].processes[task.id] = task;
			}
			else {
				throw SchedulerNoSolutionError("Not enough memory to run task, no solution found using [first_fit] Algorithm");
			}

		});

		// if some device has low memory, find new place to allocate
		

		return mapping;
	}
}

Scheduler.computeActions = function(cur_mapping, next_mapping){
	var cur_tasks = {}, next_tasks = {}, actions = [];
	Object.keys(cur_mapping).forEach(function(id){
		var engine = cur_mapping[id];
		Object.keys(engine.processes).forEach(function(instance_id){
			cur_tasks[instance_id] = {
				engine: id,
				code_name: engine.processes[instance_id].code_name
			};
		})
	});
	Object.keys(next_mapping).forEach(function(id){
		var engine = next_mapping[id];
		Object.keys(engine.processes).forEach(function(instance_id){
			next_tasks[instance_id] = {
				engine: id,
				code_name: engine.processes[instance_id].code_name,
				source: engine.processes[instance_id].source
			};
		})
	});

	Object.keys(next_tasks).forEach(function(instance_id){
		var task = next_tasks[instance_id];
		if (instance_id in cur_tasks){
			if (cur_tasks[instance_id].engine !== task.engine){
				actions.push({
					type: 'migrate',
					args: [ cur_tasks[instance_id].engine, task.engine, task.code_name, instance_id ]
				})
			}
			delete cur_tasks[instance_id];
		}
		else {
			actions.push({
				type: 'run',
				args: [ task.engine, task.code_name, task.source ]
			})
		}
	});

	Object.keys(cur_tasks).forEach(function(instance_id){
		var task = cur_tasks[instance_id];
		actions.push({
			type: 'kill',
			args: [ instance_id ]
		})
	});

	// console.log(actions);

	return actions;
}

module.exports = Scheduler;