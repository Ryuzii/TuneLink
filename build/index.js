const { Connection } = require("./structures/Connection");
const { Filters } = require("./structures/Filters");
const { Node } = require("./structures/Node");
const { TuneLink } = require("./structures/TuneLink");
const { Player } = require("./structures/Player");
const { Plugin } = require("./structures/Plugin");
const { Queue } = require("./structures/Queue");
const { Rest } = require("./structures/Rest");
const { Track } = require("./structures/Track");

module.exports = {
    TuneLink,
    Node,
    Player,
    Plugin,
    Track,
    Queue,
    Filters,
    Connection,
    Rest
};