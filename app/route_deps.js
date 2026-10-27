function asDeps(args, names) {
    const deps = {};
    let index = 0;
    for (const name of names) {
        deps[name] = args[index++];
    }
    return deps;
}

module.exports = {
    asDeps
};
