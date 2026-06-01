export const name = 'messageReactionAdd';
export const displayName = 'Reaction Handler para Sesiones';

export async function execute(reaction, user) {
    if (user.bot) return;
    if (reaction.partial) {
        try { await reaction.fetch(); } catch (error) { return; }
    }

    if (reaction.emoji.name === '✅' && global.mapaVotos && global.mapaVotos.has(reaction.message.id)) {
        global.mapaVotos.get(reaction.message.id).add(user.id);
        console.log(`[00Y4n Bot] ${user.username} guardado en lista de acceso.`);
    }
}

// También manejamos cuando sacan la reacción
export const additionalEvents = {
    messageReactionRemove: async (reaction, user) => {
        if (user.bot) return;
        if (reaction.partial) {
            try { await reaction.fetch(); } catch (error) { return; }
        }
        if (reaction.emoji.name === '✅' && global.mapaVotos && global.mapaVotos.has(reaction.message.id)) {
            global.mapaVotos.get(reaction.message.id).delete(user.id);
            console.log(`[00Y4n Bot] ${user.username} eliminado de la lista de acceso.`);
        }
    }
};
