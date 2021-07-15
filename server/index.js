var http = require('http');
var righto = require('righto');
var axios = require('axios');
var LRU = require('lru-cache');
var SeaLion = require('sea-lion');
var Dion = require('dion');
var compression = require('compression');
var compress = compression();

var allPetitionsUrl = 'https://epetitions.aph.gov.au/api/petitions/open?pagesize=1000&pageindex=0&keywords=%20&sort=PetitionNumber&desc=true&type=All&from=&to=&status=1,2,3,4';
var router = new SeaLion();
var fileServer = new Dion(router);
var cacheTime = 2000;

function staleCache(maxAge, load){
    var staleValue;
    var loading;

    return function(callback) {
        if(!loading && (!staleValue || Date.now() - staleValue.timestamp > maxAge)){
            loading = true;
            var newValue = righto(load)
            newValue.timestamp = Date.now();
            newValue(function(error){
                loading = false;

                if(!error){
                    staleValue = newValue;
                }
            })

            if(!staleValue){
                staleValue = newValue;
            }
        }

        return staleValue(callback);
    }
}

function inflatePetitionData(data, lastData){
    return data.reduce((results, item) => {
        var lastUpdate = lastData && lastData[item.PetitionNumber];
        item._lastUpdated = Date.now();

        if(lastUpdate){
            var timeDelta = 1 / 60 * ((item._lastUpdated - lastUpdate._lastUpdated) / 1000);
            var signersDelta = item.SignatureCount - lastUpdate.SignatureCount;
            var signersPerMinute = signersDelta / timeDelta;
            item.signersPerMinute = lastUpdate.signersPerMinute
                ? (lastUpdate.signersPerMinute * 4 + signersPerMinute) / 5
                : signersPerMinute;
        }

        results[item.PetitionNumber] = item;
        return results;
    }, {});
}

var lastData;
var fetchPetitions = staleCache(cacheTime, function(callback){
    var petitionData = righto.from(axios({
        url: allPetitionsUrl,
        headers: {
            'Accept': 'application/json'
        }
    }))
    .get('data')
    .get(data => {
        var result = righto.sync(inflatePetitionData, data, lastData);
        lastData = petitionData;
        return result;
    });

    petitionData(callback);
});

function roundTo(value, places) {
    return Math.round(value * Math.pow(10, places)) / Math.pow(10, places)
}

var getFormatedPetitions = staleCache(cacheTime / 4, function(callback) {
    var petitions = righto(fetchPetitions);
    var formatted = petitions.get(petitions => 
        Object.keys(petitions)
        .map((petitionNumber) => {
            var petition = petitions[petitionNumber];

            return {
                PPetitionerName: petition.PPetitionerName,
                PetitionNumber: petition.PetitionNumber,
                PetitionTitle: petition.PetitionSummary,
                SignatureCount: petition.SignatureCount,
                signersPerMinute: petition.signersPerMinute,
                _lastUpdated: petition._lastUpdated,
                SignDeadline: petition.SignDeadline
            };
        })
        .sort((a, b) => b.SignatureCount - a.SignatureCount)
        .sort((a, b) => roundTo(b.signersPerMinute, 2) - roundTo(a.signersPerMinute, 2))
        .slice(0, 100)
        .reduce((result, petition) => {
            result[petition.PetitionNumber] = petition;

            return result;
        }, {})
    );

    formatted(callback);
});

function getPetitions(request, response, tokens, callback){
    var formattedPetitions = righto(getFormatedPetitions);

    formattedPetitions(callback);
}

function respond(controller){
    return function(request, response, tokens){
        compress(request, response, function(){
            righto(controller, request, response, tokens)(function(error, result){
                if(error){
                    if(!error.status){
                        console.error(error);
                    }
                    response.writeHead(error.status || 500);
                    response.end(error.status ? error.message : 'Unknown error');
                    return;
                }

                response.writeHead(200, { 'content-type': 'application/json' });
                response.end(JSON.stringify(result));   
            });  
        });
    };
}

router.add({
    '/': fileServer.serveFile('./static/index.html', 'text/html'),
    '/petitions': respond(getPetitions),
    '/`path...`': fileServer.serveDirectory('./static', {
        '.json': 'application/json',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.gif': 'image/gif'
    })
});

var server = http.createServer(router.createHandler());

server.listen(8088);
