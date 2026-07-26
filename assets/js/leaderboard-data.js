/**
 * Jan Voice — shared weekly leaderboard fetch (calls the weekly_leaderboard
 * Postgres RPC defined in database/supabase-functions.sql).
 */
window.jv = window.jv || {};

window.jv.weeklyLeaderboard = async function (limit = 20) {
    const { data, error } = await window.jv.supabase.rpc('weekly_leaderboard', { p_limit: limit });
    if (error) {
        console.error('weekly_leaderboard RPC failed', error);
        return [];
    }
    return data || [];
};
