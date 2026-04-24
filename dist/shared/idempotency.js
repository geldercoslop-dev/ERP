export function isInProgress(res) {
    return (typeof res === "object" &&
        res !== null &&
        res.ok === false &&
        res.inProgress === true);
}
