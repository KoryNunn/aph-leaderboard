var http = require('http');
var axios = require('axios');
var LRU = require('lru-cache');
var SeaLion = require('sea-lion');
var Dion = require('dion');

var allPetitionsUrl = 'https://epetitions.aph.gov.au/petitions/all';
var router = new SeaLion();
var fileServer = new Dion(router);
var allPetitionsCache = new LRU({
    maxAge: 4000
});
var allPetitions;
var formattedPetitionsCache = new LRU({
    maxAge: 500
});

async function fetchPetitions(){
    if(!allPetitionsCache.has('all')){
        allPetitionsCache.set('all', axios({
            url: 'https://epetitions.aph.gov.au/petitions/all',
            headers: {
                'Accept': 'application/json'
            }
        })
        .then(response => response.data.reduce((results, item) => {
            var lastUpdate = allPetitions && allPetitions[item.PetitionNumber];
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
        }, {})));

        allPetitionsCache.get('all').then(results => {
            allPetitions = results
        });

        return allPetitionsCache.get('all');
    }

    return allPetitions || allPetitionsCache.get('all');
}

function roundTo(value, places) {
    return Math.round(value * Math.pow(10, places)) / Math.pow(10, places)
}

async function getPetitions(request, response, tokens) {
    if(!formattedPetitionsCache.has('all')){
        formattedPetitionsCache.set('all', fetchPetitions()
            .then(petitions => 
                Object.keys(petitions)
                .map((petitionNumber) => {
                    var petition = petitions[petitionNumber];

                    return {
                        PPetitionerName: petition.PPetitionerName,
                        PetitionNumber: petition.PetitionNumber,
                        PetitionTitle: petition.PetitionTitle,
                        SignatureCount: petition.SignatureCount,
                        signersPerMinute: petition.signersPerMinute,
                        _lastUpdated: petition._lastUpdated
                    };
                })
                .sort((a, b) => b.SignatureCount - a.SignatureCount)
                .sort((a, b) => roundTo(b.signersPerMinute, 2) - roundTo(a.signersPerMinute, 2))
                .slice(0, 100)
                .reduce((result, petition) => {
                    result[petition.PetitionNumber] = petition;

                    return result;
                }, {})
            )
        )
    }

    return formattedPetitionsCache.get('all');
}

async function getPetition(request, response, tokens){
    var allPetitions = await fetchPetitions();

    if(!('petitionNumber' in tokens) || !(tokens.petitionNumber in allPetitions)){
        var error = {
            status: 404,
            message: 'Petition not found'
        };

        throw error;
    }

    return allPetitions[tokens.petitionNumber];
}

function respond(controller){
    return function(request, response, tokens){
        Promise.resolve(controller(request, response, tokens))
        .then(result => {
            response.writeHead(200);
            response.end(JSON.stringify(result));   
        })
        .catch(error => {
            if(!error.status){
                console.error(error);
            }
            response.writeHead(error.status || 500);
            response.end(error.status ? error.message : 'Unknown error');
        });
    };
}

router.add({
    '/': fileServer.serveFile('./static/index.html', 'text/html'),
    '/petitions': respond(getPetitions),
    '/petitions/`petitionNumber`': respond(getPetition),
    '/`path...`': fileServer.serveDirectory('./static', {
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.gif': 'image/gif'
    })
});

var server = http.createServer(router.createHandler());

server.listen(8088);
