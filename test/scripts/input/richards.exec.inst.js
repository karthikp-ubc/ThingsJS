require('things-js/lib/core/Code').bootstrap(module, function (Σ) {
    Σ.setExtractor(function () {
        return [
            {},
            {
                COUNT: COUNT,
                EXPECTED_QUEUE_COUNT: EXPECTED_QUEUE_COUNT,
                EXPECTED_HOLD_COUNT: EXPECTED_HOLD_COUNT,
                ID_IDLE: ID_IDLE,
                ID_WORKER: ID_WORKER,
                ID_HANDLER_A: ID_HANDLER_A,
                ID_HANDLER_B: ID_HANDLER_B,
                ID_DEVICE_A: ID_DEVICE_A,
                ID_DEVICE_B: ID_DEVICE_B,
                NUMBER_OF_IDS: NUMBER_OF_IDS,
                KIND_DEVICE: KIND_DEVICE,
                KIND_WORK: KIND_WORK,
                STATE_RUNNING: STATE_RUNNING,
                STATE_RUNNABLE: STATE_RUNNABLE,
                STATE_SUSPENDED: STATE_SUSPENDED,
                STATE_HELD: STATE_HELD,
                STATE_SUSPENDED_RUNNABLE: STATE_SUSPENDED_RUNNABLE,
                STATE_NOT_HELD: STATE_NOT_HELD,
                DATA_SIZE: DATA_SIZE,
                performance: performance,
                BM_RunFunc: BM_RunFunc,
                BM_SetupFunc: BM_SetupFunc,
                BM_TearDownFunc: BM_TearDownFunc,
                BM_RMS: BM_RMS,
                BM_Iterations: BM_Iterations,
                BM_Min_Iterations: BM_Min_Iterations,
                BM_Results: BM_Results
            }
        ];
    }).hoist(runRichards, Σ).hoist(Scheduler, Σ).hoist(TaskControlBlock, Σ).hoist(IdleTask, Σ).hoist(DeviceTask, Σ).hoist(WorkerTask, Σ).hoist(HandlerTask, Σ).hoist(Packet, Σ).hoist(BM_Start, Σ);
    function runRichards() {
        var Σ_runRichards = new Σ.Scope(this, Σ, runRichards, function () {
            return [
                {},
                {
                    scheduler: scheduler,
                    queue: queue
                }
            ];
        });
        var scheduler = new Scheduler();
        scheduler.addIdleTask(ID_IDLE, 0, null, COUNT);
        var queue = new Packet(null, ID_WORKER, KIND_WORK);
        queue = new Packet(queue, ID_WORKER, KIND_WORK);
        scheduler.addWorkerTask(ID_WORKER, 1000, queue);
        queue = new Packet(null, ID_DEVICE_A, KIND_DEVICE);
        queue = new Packet(queue, ID_DEVICE_A, KIND_DEVICE);
        queue = new Packet(queue, ID_DEVICE_A, KIND_DEVICE);
        scheduler.addHandlerTask(ID_HANDLER_A, 2000, queue);
        queue = new Packet(null, ID_DEVICE_B, KIND_DEVICE);
        queue = new Packet(queue, ID_DEVICE_B, KIND_DEVICE);
        queue = new Packet(queue, ID_DEVICE_B, KIND_DEVICE);
        scheduler.addHandlerTask(ID_HANDLER_B, 3000, queue);
        scheduler.addDeviceTask(ID_DEVICE_A, 4000, null);
        scheduler.addDeviceTask(ID_DEVICE_B, 5000, null);
        scheduler.schedule();
        if (scheduler.queueCount != EXPECTED_QUEUE_COUNT || scheduler.holdCount != EXPECTED_HOLD_COUNT) {
            var msg = 'Error during execution: queueCount = ' + scheduler.queueCount + ', holdCount = ' + scheduler.holdCount + '.';
            throw new Error(msg);
        }
    }
    var COUNT = 1000;
    var EXPECTED_QUEUE_COUNT = 2322;
    var EXPECTED_HOLD_COUNT = 928;
    function Scheduler() {
        this.queueCount = 0;
        this.holdCount = 0;
        this.blocks = new Array(NUMBER_OF_IDS);
        this.list = null;
        this.currentTcb = null;
        this.currentId = null;
    }
    var ID_IDLE = 0;
    var ID_WORKER = 1;
    var ID_HANDLER_A = 2;
    var ID_HANDLER_B = 3;
    var ID_DEVICE_A = 4;
    var ID_DEVICE_B = 5;
    var NUMBER_OF_IDS = 6;
    var KIND_DEVICE = 0;
    var KIND_WORK = 1;
    Scheduler.prototype.addIdleTask = Σ.addFunction(function α0(id, priority, queue, count) {
        this.addRunningTask(id, priority, queue, new IdleTask(this, 1, count));
    }, Σ);
    Scheduler.prototype.addWorkerTask = Σ.addFunction(function α1(id, priority, queue) {
        this.addTask(id, priority, queue, new WorkerTask(this, ID_HANDLER_A, 0));
    }, Σ);
    Scheduler.prototype.addHandlerTask = Σ.addFunction(function α2(id, priority, queue) {
        this.addTask(id, priority, queue, new HandlerTask(this));
    }, Σ);
    Scheduler.prototype.addDeviceTask = Σ.addFunction(function α3(id, priority, queue) {
        this.addTask(id, priority, queue, new DeviceTask(this));
    }, Σ);
    Scheduler.prototype.addRunningTask = Σ.addFunction(function α4(id, priority, queue, task) {
        this.addTask(id, priority, queue, task);
        this.currentTcb.setRunning();
    }, Σ);
    Scheduler.prototype.addTask = Σ.addFunction(function α5(id, priority, queue, task) {
        this.currentTcb = new TaskControlBlock(this.list, id, priority, queue, task);
        this.list = this.currentTcb;
        this.blocks[id] = this.currentTcb;
    }, Σ);
    Scheduler.prototype.schedule = Σ.addFunction(function α6() {
        this.currentTcb = this.list;
        while (this.currentTcb != null) {
            if (this.currentTcb.isHeldOrSuspended()) {
                this.currentTcb = this.currentTcb.link;
            } else {
                this.currentId = this.currentTcb.id;
                this.currentTcb = this.currentTcb.run();
            }
        }
    }, Σ);
    Scheduler.prototype.release = Σ.addFunction(function α7(id) {
        var Σ_α7 = new Σ.Scope(this, Σ, α7, function () {
            return [
                { id: id },
                { tcb: tcb }
            ];
        });
        var tcb = this.blocks[id];
        if (tcb == null) {
            return tcb;
        }
        tcb.markAsNotHeld();
        if (tcb.priority > this.currentTcb.priority) {
            return tcb;
        } else {
            return this.currentTcb;
        }
    }, Σ);
    Scheduler.prototype.holdCurrent = Σ.addFunction(function α8() {
        this.holdCount++;
        this.currentTcb.markAsHeld();
        return this.currentTcb.link;
    }, Σ);
    Scheduler.prototype.suspendCurrent = Σ.addFunction(function α9() {
        this.currentTcb.markAsSuspended();
        return this.currentTcb;
    }, Σ);
    Scheduler.prototype.queue = Σ.addFunction(function α10(packet) {
        var Σ_α10 = new Σ.Scope(this, Σ, α10, function () {
            return [
                { packet: packet },
                { t: t }
            ];
        });
        var t = this.blocks[packet.id];
        if (t == null) {
            return t;
        }
        this.queueCount++;
        packet.link = null;
        packet.id = this.currentId;
        return t.checkPriorityAdd(this.currentTcb, packet);
    }, Σ);
    function TaskControlBlock(link, id, priority, queue, task) {
        this.link = link;
        this.id = id;
        this.priority = priority;
        this.queue = queue;
        this.task = task;
        if (queue == null) {
            this.state = STATE_SUSPENDED;
        } else {
            this.state = STATE_SUSPENDED_RUNNABLE;
        }
    }
    var STATE_RUNNING = 0;
    var STATE_RUNNABLE = 1;
    var STATE_SUSPENDED = 2;
    var STATE_HELD = 4;
    var STATE_SUSPENDED_RUNNABLE = STATE_SUSPENDED | STATE_RUNNABLE;
    var STATE_NOT_HELD = ~STATE_HELD;
    TaskControlBlock.prototype.setRunning = Σ.addFunction(function α11() {
        this.state = STATE_RUNNING;
    }, Σ);
    TaskControlBlock.prototype.markAsNotHeld = Σ.addFunction(function α12() {
        this.state = this.state & STATE_NOT_HELD;
    }, Σ);
    TaskControlBlock.prototype.markAsHeld = Σ.addFunction(function α13() {
        this.state = this.state | STATE_HELD;
    }, Σ);
    TaskControlBlock.prototype.isHeldOrSuspended = Σ.addFunction(function α14() {
        return (this.state & STATE_HELD) != 0 || this.state == STATE_SUSPENDED;
    }, Σ);
    TaskControlBlock.prototype.markAsSuspended = Σ.addFunction(function α15() {
        this.state = this.state | STATE_SUSPENDED;
    }, Σ);
    TaskControlBlock.prototype.markAsRunnable = Σ.addFunction(function α16() {
        this.state = this.state | STATE_RUNNABLE;
    }, Σ);
    TaskControlBlock.prototype.run = Σ.addFunction(function α17() {
        var Σ_α17 = new Σ.Scope(this, Σ, α17, function () {
            return [
                {},
                { packet: packet }
            ];
        });
        var packet;
        if (this.state == STATE_SUSPENDED_RUNNABLE) {
            packet = this.queue;
            this.queue = packet.link;
            if (this.queue == null) {
                this.state = STATE_RUNNING;
            } else {
                this.state = STATE_RUNNABLE;
            }
        } else {
            packet = null;
        }
        return this.task.run(packet);
    }, Σ);
    TaskControlBlock.prototype.checkPriorityAdd = Σ.addFunction(function α18(task, packet) {
        if (this.queue == null) {
            this.queue = packet;
            this.markAsRunnable();
            if (this.priority > task.priority) {
                return this;
            }
        } else {
            this.queue = packet.addTo(this.queue);
        }
        return task;
    }, Σ);
    TaskControlBlock.prototype.toString = Σ.addFunction(function α19() {
        return 'tcb { ' + this.task + '@' + this.state + ' }';
    }, Σ);
    function IdleTask(scheduler, v1, count) {
        this.scheduler = scheduler;
        this.v1 = v1;
        this.count = count;
    }
    IdleTask.prototype.run = Σ.addFunction(function α20(packet) {
        this.count--;
        if (this.count == 0) {
            return this.scheduler.holdCurrent();
        }
        if ((this.v1 & 1) == 0) {
            this.v1 = this.v1 >> 1;
            return this.scheduler.release(ID_DEVICE_A);
        } else {
            this.v1 = this.v1 >> 1 ^ 53256;
            return this.scheduler.release(ID_DEVICE_B);
        }
    }, Σ);
    IdleTask.prototype.toString = Σ.addFunction(function α21() {
        return 'IdleTask';
    }, Σ);
    function DeviceTask(scheduler) {
        this.scheduler = scheduler;
        this.v1 = null;
    }
    DeviceTask.prototype.run = Σ.addFunction(function α22(packet) {
        if (packet == null) {
            if (this.v1 == null) {
                return this.scheduler.suspendCurrent();
            }
            var v = this.v1;
            this.v1 = null;
            return this.scheduler.queue(v);
        } else {
            this.v1 = packet;
            return this.scheduler.holdCurrent();
        }
    }, Σ);
    DeviceTask.prototype.toString = Σ.addFunction(function α23() {
        return 'DeviceTask';
    }, Σ);
    function WorkerTask(scheduler, v1, v2) {
        this.scheduler = scheduler;
        this.v1 = v1;
        this.v2 = v2;
    }
    WorkerTask.prototype.run = Σ.addFunction(function α24(packet) {
        if (packet == null) {
            return this.scheduler.suspendCurrent();
        } else {
            if (this.v1 == ID_HANDLER_A) {
                this.v1 = ID_HANDLER_B;
            } else {
                this.v1 = ID_HANDLER_A;
            }
            packet.id = this.v1;
            packet.a1 = 0;
            for (var i = 0; i < DATA_SIZE; i++) {
                this.v2++;
                if (this.v2 > 26) {
                    this.v2 = 1;
                }
                packet.a2[i] = this.v2;
            }
            return this.scheduler.queue(packet);
        }
    }, Σ);
    WorkerTask.prototype.toString = Σ.addFunction(function α25() {
        return 'WorkerTask';
    }, Σ);
    function HandlerTask(scheduler) {
        this.scheduler = scheduler;
        this.v1 = null;
        this.v2 = null;
    }
    HandlerTask.prototype.run = Σ.addFunction(function α26(packet) {
        if (packet != null) {
            if (packet.kind == KIND_WORK) {
                this.v1 = packet.addTo(this.v1);
            } else {
                this.v2 = packet.addTo(this.v2);
            }
        }
        if (this.v1 != null) {
            var count = this.v1.a1;
            var v;
            if (count < DATA_SIZE) {
                if (this.v2 != null) {
                    v = this.v2;
                    this.v2 = this.v2.link;
                    v.a1 = this.v1.a2[count];
                    this.v1.a1 = count + 1;
                    return this.scheduler.queue(v);
                }
            } else {
                v = this.v1;
                this.v1 = this.v1.link;
                return this.scheduler.queue(v);
            }
        }
        return this.scheduler.suspendCurrent();
    }, Σ);
    HandlerTask.prototype.toString = Σ.addFunction(function α27() {
        return 'HandlerTask';
    }, Σ);
    var DATA_SIZE = 4;
    function Packet(link, id, kind) {
        this.link = link;
        this.id = id;
        this.kind = kind;
        this.a1 = 0;
        this.a2 = new Array(DATA_SIZE);
    }
    Packet.prototype.addTo = Σ.addFunction(function α28(queue) {
        var Σ_α28 = new Σ.Scope(this, Σ, α28, function () {
            return [
                { queue: queue },
                {
                    peek: peek,
                    next: next
                }
            ];
        });
        this.link = null;
        if (queue == null) {
            return this;
        }
        var peek, next = queue;
        while ((peek = next.link) != null) {
            next = peek;
        }
        next.link = this;
        return queue;
    }, Σ);
    Packet.prototype.toString = Σ.addFunction(function α29() {
        return 'Packet';
    }, Σ);
    var performance = {};
    performance.now = Σ.addFunction(function α30() {
        return Date.now();
    }, Σ);
    var BM_RunFunc = runRichards;
    var BM_SetupFunc = Σ.addFunction(function α31() {
    }, Σ);
    var BM_TearDownFunc = Σ.addFunction(function α32() {
    }, Σ);
    var BM_RMS = undefined;
    var BM_Iterations = 6000;
    var BM_Min_Iterations = 16;
    var BM_Results = [];
    function BM_Start() {
        var Σ_BM_Start = new Σ.Scope(this, Σ, BM_Start, function () {
            return [
                {},
                {
                    data: data,
                    elapsed: elapsed,
                    start: start,
                    end: end,
                    i: i
                }
            ];
        }).hoist(doRun, Σ_BM_Start);
        var data = {
            runs: 0,
            elapsed: 0
        };
        var elapsed = 0;
        var start = Date.now();
        var mid = null;
        var end = null;
        var i = 0;
        function doRun() {
            BM_SetupFunc();
            Σ.console.log('Iteration : ' + i);
            BM_RunFunc();
            elapsed = Date.now() - start;
            BM_TearDownFunc();
            i++;
            if (i < BM_Iterations) {
                if (i === BM_Iterations / 2 + 1){
                    mid = Date.now();
                    process.send({ tag: "mid" });
                }
                Σ.setImmediate(doRun);
            } else {
                if (data != null) {
                    data.runs += i;
                    data.elapsed += elapsed;
                }
                Σ.console.log('Runs: ' + data.runs + '\t|\tElapsed: ' + data.elapsed);
                end = Date.now();
                Σ.console.log('Total time : ' + (end - start) + ' ms');
                var usec = data.elapsed * 1000 / data.runs;
                var rms = BM_RMS ? BM_RMS() : 0;
                BM_Results.push({
                    time: usec,
                    latency: rms
                });
                process.send({ tag: "end", elapsed: end - mid });
            }
        }
        Σ.setImmediate(doRun);
    }
    BM_Start();
}, 'mqtt://localhost', 'richards.js', {});
