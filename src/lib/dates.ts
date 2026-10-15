/** Today's date (YYYY-MM-DD). TRACKER_TODAY pins it, which keeps demos on the dummy data stable. */
export const today = () => process.env.TRACKER_TODAY || new Date().toISOString().slice(0, 10);
