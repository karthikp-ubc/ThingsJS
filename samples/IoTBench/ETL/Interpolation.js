var things = require('things-js');
var fs = require('fs');
var mongoUrl = 'mongodb://localhost:27017/things-js-fs';
var GFS = require('things-js').addons.gfs(mongoUrl);

var pubsub_url = 'mqtt://localhost';
var pubsub_topic = 'thingsjS/IoTBench/ETL/BloomFilterCheck';
var publish_topic = 'thingsjs/IoTBench/ETL/Interpolation';

var pubsub = new things.Pubsub(pubsub_url);

/* interpolation properties */
var ID = 'ID';
var USE_MSG_FIELD_LIST, WINDOW_SIZE;
var valuesMap = {};

// mkdir RIOT/ETL folder if not exist 
// save file inside 
function setup(){
	var args = process.argv.slice(2);
	var properties;

	// default to TAXI property set if no specific property file is given
	if(!args.length){
		args = ['./TAXI_properties.json'];
	}
	try{
		  GFS.readFile(args[0], function(err2, data){
	   		if (err2) throw err2;
	 		properties = data;
		});		
		USE_MSG_FIELD_LIST = properties['INTERPOLATION.USE_MSG_FIELD_LIST'];
		WINDOW_SIZE = properties['INTERPOLATION.WINDOW_SIZE'] || 0;

		if(!USE_MSG_FIELD_LIST){
			console.log('No fields to interpolate');
			process.exit();
		}
	}
	catch(e){
		console.log('Couldn\'t fetch properties: ' + e);
		process.exit();
	}
}

function interpolate(data){

	if(WINDOW_SIZE === 0){
		// do nothing with the data
		console.log('No interpolation needed. Publishing data');
		pubsub.publish(publish_topic, data);
		return;
	}

	USE_MSG_FIELD_LIST.forEach(function(field){
		var key = ID + field;

		if(field in data){

			if(key in valuesMap){
				if(data[field] === null){
					var count = 0;
					valuesMap[key].forEach(function(val){
						count += val;
					});
					var newValue = ( count ) / ( valuesMap[key].length );
					console.log( 'Interpolated field ' + field + 'with new value: ' + newValue );
					data[field] = newValue;
				}
				else{
					// add the new data in
					if(valuesMap[key].length === WINDOW_SIZE){
						valuesMap.splice(0, 1);
					}
					valuesMap[key].push(data[field]);
				}
			}
			else if(data[field] !== null){
				valuesMap[key] = [data[Field]];
			}
		}
	});
	pubsub.publish(publish_topic, data);
}

pubsub.on('ready', function(){
	setup();
	console.log('Beginning Interpolation');
	pubsub.subscribe(pubsub_topic, interpolate);
});

