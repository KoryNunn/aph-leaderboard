var fastn = require('fastn')(require('fastn/domComponents')());
var mutate = fastn.Model;
var binding = fastn.binding;

var state = {
    petitions: {}
};

function fetchPetitions() {
    return fetch(`/petitions`)
    .then(response => response.json())
    .then(petitions => {
        mutate.update(state, `petitions`, petitions);
    })
}

function fetchPetition(petitionNumber) {
    return fetch(`/petitions/${petitionNumber}`)
    .then(response => response.json())
    .then(petition => {
        mutate.set(state, `petitions.${petitionNumber}`, petition);
    })
}

function roundTo(value, places) {
    return Math.round(value * Math.pow(10, places)) / Math.pow(10, places)
}

var ui = fastn('div', 
        fastn('h1', 'APH Petition live leaderboard'),
        fastn('h2', 'Top 100 petitions right now.'),
        fastn('list', {
            items: binding('petitions|*.signersPerMinute', petitions => {
                if(!petitions) {
                    return
                }

                var sorted = Object.keys(petitions)
                    .map(petitionNumber => petitions[petitionNumber])
                    .sort((a, b) => b.SignatureCount - a.SignatureCount)
                    .sort((a, b) => roundTo(b.signersPerMinute, 2) - roundTo(a.signersPerMinute, 2))

                console.log(sorted.slice(0, 10));
                return sorted;
            }),
            insertionFrameTime: 50,
            template: function(){
                return fastn('div', { class: 'petition' },
                    fastn('h3', fastn('a', {
                        href: binding('item.PetitionNumber', petitionNumber => 'https://www.aph.gov.au/petition_list?id=${petitionNumber}')
                    }, binding('item.PetitionTitle'))),

                    fastn('p',
                        fastn('span', 'Signatures: ', 
                            fastn('span', { class: ' value'}, binding('item.SignatureCount'))
                        ),
                        ' ',
                        fastn('span', 'Signatures per minute: ', 
                            fastn('span', { class: ' value'}, binding('item.signersPerMinute', perMinute => perMinute ? perMinute.toFixed(2) : '...'))
                        )
                    )
                )
            }
        })
    )
    .attach(state)
    .render();

window.addEventListener('DOMContentLoaded', function(){
    document.body.appendChild(ui.element);

    fetchPetitions();
    setInterval(fetchPetitions, 5000);
})