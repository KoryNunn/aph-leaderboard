var fastn = require('fastn')(require('fastn/domComponents')());
var EventEmitter = require('events');
var mutate = fastn.Model;
var binding = fastn.binding;

var state = {
    petitions: {}
};

function smoothBinding(frequency, ...args){
    var currentValue;
    var lastEmittedValue;
    var lastUpdatedAt;
    var lastUpdateDuration = 1000;
    var internalBinding = binding(...args);
    var fakeBinding = function(){
        return lastEmittedValue;
    }
    fakeBinding.__proto__ = new EventEmitter();

    fakeBinding._fastn_binding = true;
    fakeBinding.attach = internalBinding.attach;
    fakeBinding.detach = internalBinding.detach;
    fakeBinding.destroy = internalBinding.destroy;

    internalBinding.on('change', value => {
        currentValue = value;

        if(isNaN(lastEmittedValue)){
            lastUpdatedAt = Date.now();
            lastEmittedValue = currentValue;
            fakeBinding.emit('change', currentValue);
            return;
        }

        lastUpdateDuration = Date.now() - lastUpdatedAt;
    });

    setInterval(function(){
        var damper = (lastUpdateDuration / frequency);
        lastEmittedValue = (lastEmittedValue * damper + currentValue) / (damper + 1);
        fakeBinding.emit('change', lastEmittedValue);
    }, frequency);

    return fakeBinding;
}

function fetchPetitions() {
    return fetch(`/petitions`)
    .then(response => response.json())
    .then(petitions => {
        mutate.update(state, `petitions`, petitions);

        setTimeout(fetchPetitions, 2000);
    });
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
        fastn('section', 
            fastn('h2', 'Top 100 petitions right now.'),
            fastn('list', {
                class: 'petitions',
                items: binding('petitions|*.signersPerMinute', petitions => {
                    if(!petitions) {
                        return
                    }

                    var sorted = Object.keys(petitions)
                        .map(petitionNumber => petitions[petitionNumber])
                        .sort((a, b) => b.SignatureCount - a.SignatureCount)
                        .sort((a, b) => roundTo(b.signersPerMinute, 2) - roundTo(a.signersPerMinute, 2))

                    return sorted;
                }),
                insertionFrameTime: 50,
                template: function(){
                    return fastn('div', {
                        class: binding('item.signersPerMinute', signersPerMinute => {
                            var level;
                            if (signersPerMinute < 0.1) {
                                level = 'asleep'
                            } else if (signersPerMinute < 0.5) {
                                level = 'tired'
                            } else if (signersPerMinute < 1) {
                                level = 'cool'
                            } else if (signersPerMinute < 3) {
                                level = 'smiling'
                            } else if (signersPerMinute < 10) {
                                level = 'inLove'
                            } else {
                                level = 'hot'
                            }

                            return [
                                'petition',
                                level
                            ]
                        })
                    },
                        fastn('h3', fastn('a', {
                            href: binding('item.PetitionNumber', petitionNumber => `https://www.aph.gov.au/petition_list?id=${petitionNumber}`)
                        }, 
                            binding('item.PetitionTitle')
                        )),

                        fastn('p',
                            fastn('span', 'Signatures: ', 
                                fastn('span', { class: 'value count'}, binding(smoothBinding(100, 'item.SignatureCount'), value => value.toFixed(0)))
                            ),
                            ' ',
                            fastn('span', 'Signatures per minute: ', 
                                fastn('span', { class: 'value perMinute'}, binding(smoothBinding(300, 'item.signersPerMinute'), perMinute => !isNaN(perMinute) ? perMinute.toFixed(2) : '...')),
                                fastn('img', {
                                    display: binding('item.signersPerMinute', value => !isNaN(value)),
                                    src: binding('item.signersPerMinute',  signersPerMinute => {
                                        if (signersPerMinute < 0.1) {
                                            return '/images/icons/016-sleeping.svg'
                                        }

                                        if (signersPerMinute < 0.5) {
                                            return '/images/icons/008-tired.svg'
                                        }

                                        if (signersPerMinute < 1) {
                                            return '/images/icons/012-cool-2.svg'
                                        }

                                        if (signersPerMinute < 3) {
                                            return '/images/icons/014-smiling.svg'
                                        }

                                        if (signersPerMinute < 3) {
                                            return '/images/icons/014-smiling.svg'
                                        }

                                        if (signersPerMinute < 10) {
                                            return '/images/icons/068-in-love.svg'
                                        }

                                        return '/images/icons/fire.gif'
                                    })
                                })
                            )
                        )
                    )
                }
            })
        ),
        fastn('footer',
            fastn('span', 
                'Icons made by ',
                fastn('a', {
                    href: "https://www.flaticon.com/authors/pixel-perfect",
                    title: "Pixel perfect"
                }, 'Pixel perfect'),
                ' from ',
                fastn('a', { 
                    href: "https://www.flaticon.com/",
                    title: "Flaticon"
                },
                    'www.flaticon.com'
                )
            ),
            fastn('span', 
                'Code: ',
                fastn('a', { href: 'https://github.com/KoryNunn/aph-leaderboard' }, 'https://github.com/KoryNunn/aph-leaderboard')
            )
        )
    )
    .attach(state)
    .render();

window.addEventListener('DOMContentLoaded', function(){
    document.body.appendChild(ui.element);

    fetchPetitions();
})
