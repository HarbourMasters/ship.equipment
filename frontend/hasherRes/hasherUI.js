/*
    Hasher-js UI

    This file is *not* transpiled. It is written to work in browsers as-is, but
    may require a Promise polyfill.
*/

// @ts-check
"use strict";


///////////////////// Variables //////////////////////////////////////////////


// How do I declare a pre-existing global? (re: ts error checking)
var $ = $;
var Hasher = Hasher;

/** Contains a collection of jQuery objects for DOM elements */
var ui;

/** Set to true while a ROM is being processed */
var isHashing = false;

/** Length of time until the hashing modal will be shown, in milliseconds. */
var hashModalDelay = 250;

/** The Hasher object associated with the data currently being processed or displayed */
var hasher;

/** Lookup to for pretty casing of RomRegion names */
var regNameLookup = {
    file: "File",
    rom: "ROM",
};


///////////////////// Helper Functions ///////////////////////////////////////

/** Performs a jQuery call, but writes an error to the console if the selector
 *  does not match any elements on the page
 */
function $$(selector) {
    var result = $(selector);
    if (result.length == 0) console.error('bad selector', selector);
    return result;
}

/** Adds or removes one or more classes (space-separated) to a jQuery object
 *  based on the specified state.
 *  @param {*} obj jQuery object
 *  @param {boolean} state If true, the class(es) will be added, if false they'll be removed.
 *  @param {string} className Class(es) to add or remove
 */
function setClass(obj, state, className) {
    if (state) {
        obj.addClass(className);
    } else {
        obj.removeClass(className);
    }
}


///////////////////// Event Handlers /////////////////////////////////////////


/** Page initialization */
$(document).ready(function () {
    ui = {
        fileInput: $$('#file-input'),
        fileInputBox: $$('#file-input-box'),
        abortHash: $$('#abort-hash'),
        file: {
            input: $$('#file-input'),
            inputBox: $$('#file-input-box'),
            inputBoxOuter: $$('#file-input-outer'),
            gameName: $$('#game-name'),
            statusIcon: $$('#file-status-icon'),
        },
        progressBar: $$('#hash-progress'),
        progressBarMarker: $$('#hash-progress-marker'),
        romList: $$('#rom-list-body'),
        body: $$(document.body),
    };

    // File drag and drop
    ui.fileInputBox.on('drop', onFileDrop);
    ui.fileInputBox.on('dragdrop', onFileDrop);
    ui.fileInputBox.on('dragover', onDragOver);
    ui.fileInputBox.on('dragenter', onDragOver);
    ui.fileInputBox.on('dragend', onDragEnd);
    ui.fileInputBox.on('dragleave', onDragEnd);

    // File dialog
    ui.fileInput.on('change', onFileSelected);

    // 'Cancel' button
    ui.abortHash.on('click', function (ev) { hasher.cancel(); });

    populateRomList();
});

function populateRomList() {
    hasher = new Hasher(null);
    hasher.getRomDb().then(db => {
        ui.romList.empty();
        for (let hash of Object.keys(db)) {
            if (hash === 'meta' || hash === 'getEntry') continue;
            let entry = db[hash];

            ui.romList.append(`
                <tr>
                    <td>${entry.shortName}</td>
                    <td>${entry.supported ? 
                            `<i class='fas fa-check-circle' title='Supported' style='color: green;'></i>` :
                            `<i class='fas fa-times-circle' title='Unsupported' style='color: red;'></i>`
                    }</td>
                    <td>${entry.masterQuest ? `<i class='fas fa-dice' title='Master Quest'></i>` : ''}</td>
                    <td class='rom-list-region'>${entry.region}</td>
                    <td>
                        ${entry.formats.includes('cart') ? `<i class='fas fa-microchip' title='N64 Cartridge'></i>` : ''}
                        ${entry.formats.includes('optical') ? `<i class='fas fa-compact-disc' title='GameCube Optical Disc'></i>` : ''}
                        ${entry.formats.includes('digital') ? `<i class='fas fa-cloud' title='Virtual Console Download'></i>` : ''}
                        ${entry.formats.includes('debug') ? `<i class='fas fa-bug' title='Debug'></i>` : ''}
                        ${entry.formats.includes('beta') ? `<i class='fas fa-file-code' title='Beta'></i>` : ''}
                        ${entry.formats.includes('builtin') ? `<i class='fas fa-gamepad' title='iQue'></i>` : ''}
                        ${entry.formats.includes('hotel') ? `<i class='fas fa-hotel' title='LodgeNet'></i>` : ''}
                    </td>
                    <td><i class='fas fa-chess-board' title='${hash}'></i></td>
                </tr>
            `);
        }
    })
}

/** Handles the selection of a file via the file dialog */
function onFileSelected(e) {
    var files = ui.file.input[0].files;
    if (files && files.length > 0) {
        processRom(files[0]);
    }
}

/** Handles file selection via drag and drop */
function onFileDrop(e) {
    ui.file.inputBox.removeClass('file-input-filedrag');

    var dragEvent = e.originalEvent;
    dragEvent.preventDefault();

    if (dragEvent.dataTransfer.items && dragEvent.dataTransfer.items.length > 0) {
        var file = dragEvent.dataTransfer.items[0].getAsFile();
        processRom(file);
    } else if (dragEvent.dataTransfer.files && dragEvent.dataTransfer.files.length > 0) {
        processRom(dragEvent.dataTransfer.files[0]);
    }
}

function onDragOver(ev) {
    ui.file.inputBox.addClass('file-input-filedrag');

    // Prevent default behavior (Prevent file from being downloaded/opened in browser)
    ev.preventDefault();
    ev.stopPropagation();
}

function onDragEnd(ev) {
    ui.file.inputBox.removeClass('file-input-filedrag');

    // Prevent default behavior (Prevent file from being downloaded/opened in browser)
    ev.preventDefault();
    ev.stopPropagation();
}


///////////////////// UI Manipulation ////////////////////////////////////////

/** Prompts the display the hashing progress modal. */
function displayHashingModal() {
    // The modal does not actually become visible until after a short period so
    // that it does not quickly flash on and off the screen for small files.

    $(document.body).addClass('modal modal-kill');
    setTimeout(displayFullHashingModal, hashModalDelay);
}

/** Displays the hashing progress modal.
 *  Invoked after the 'grace period' by displayHashingModal. */
function displayFullHashingModal() {
    if (isHashing) {
        var randX = ~~(Math.random() * 80);
        var randY = ~~(Math.random() * 5);
        ui.progressBar.css({ backgroundPosition: randX * 6 + 'px ' + randY * 8 + 'px' });

        updateHashProgress(0);
        $(document.body).removeClass('modal-kill');
        $(document.body).addClass('modal modal-hashing');
    }
}

/** Hides the hashing progress modal */
function hideHashingModal() {
    $(document.body).removeClass('modal modal-kill modal-hashing');
}

/** Updates the hashing progress bar */
function updateHashProgress(amt) {
    var ticks = ~~(amt * 80); // ~~ truncate
    ui.progressBarMarker.css({ left: ticks * 6 + 'px' });
}


///////////////////// ROM Processing /////////////////////////////////////////

function processRom(file) {
    isHashing = true;
    displayHashingModal();

    var sha1Only = true;
    var algoList = sha1Only ? ['sha1'] : null;
    hasher = new Hasher(file);
    hasher.getRomData(algoList, updateHashProgress).then(function (result) {
        isHashing = false;
        hideHashingModal();

        // Update file box
        ui.file.inputBoxOuter.addClass('file-loaded');

        // Update status icon
        ui.file.statusIcon.empty();
        ui.file.statusIcon.removeClass();
        if (result.dbMatch.unknown) {
            ui.file.statusIcon.addClass('unknown');
            ui.file.statusIcon.append(`<i class='fas fa-question-circle' title='Unknown ROM'></i>`);
        } else if (result.dbMatch.supported) {
            ui.file.statusIcon.addClass('supported');
            ui.file.statusIcon.append(`<i class='fas fa-check-circle' title='Supported ROM'></i>`);
        } else {
            ui.file.statusIcon.addClass('unsupported');
            ui.file.statusIcon.append(`<i class='fas fa-times-circle' title='Unsupported ROM'></i>`);
        }

        ui.file.gameName.text(file.name);

    })
        .catch(console.error);
}
