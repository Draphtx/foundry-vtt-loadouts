Hooks.on("createItem", (document, options, userid) => addLoadoutItem(document));

async function addLoadoutItem(itemDocument) {
    // Do not try to handle item management for NPCs
    if(itemDocument.parent.type != "character"){
        return;
    }

    // Only handle weapons and, by extension, grenades
    var itemIsGrenade
    if((! itemDocument.type == "weapon") && (! itemDocument.type == "ammo")){
        return;
    } else if(itemDocument.type == "ammo"){
        itemIsGrenade = [
            "Grenade (Armor Piercing)",
            "Grenade (Biotoxin)",
            "Grenade (EMP)",
            "Grenade (Flashbang)",
            "Grenade (Incendiary)",
            "Grenade (Poison)",
            "Grenade (Sleep)",
            "Grenade (Smoke)",
            "Grenade (Teargas)"
        ].includes(itemDocument.name)
        if(! itemIsGrenade){
            return;
        }
    }

    const testScene = game.scenes.getName("TileTest")
    const gridSize = testScene.grid.size
    const playerId = itemDocument.parent.id

    selectedWeapon = game.actors.getName(itemDocument.name)

    // Test item size in grid units, not pixels
    let itemSizeX = selectedWeapon.prototypeToken.width
    let itemSizeY = selectedWeapon.prototypeToken.height
    let itemRotated = false

    // Get all loadout tiles from the loadout scene
    loadoutTiles = testScene.tiles.filter(tile => tile.flags.loadout)

    // filter loadout tiles to those owner by the character and those large enough to accommodate the item
    const applicableTiles = loadoutTiles.filter(tile => Math.max(tile.height/gridSize, tile.width/gridSize) >= Math.max(itemSizeX, itemSizeY) && tile.flags.loadout.owner == playerId)

    // lambda to sort player's loadout tiles by weight (preference) 0-5, arbitrarily
    const sortedTiles = applicableTiles.sort((a, b) => a.flags.loadout.weight < b.flags.loadout.weight ? -1 : 1);

    // EVERYTHING FROM HERE DOWN NEEDS A HUGE REFACTOR & CLEANUP
    // process each tile
    var tilePositions = [];
    var selectedTile = null
    for(const loadoutTile of sortedTiles){
        console.log("checking tile " + loadoutTile.id)
        tilePositions = getTilePositions(loadoutTile, itemSizeX, itemSizeY)

        if(! tilePositions.length){
            if(itemSizeX != itemSizeY){
                tilePositions = getTilePositions(loadoutTile, itemSizeY, itemSizeX)
                if(tilePositions.length){
                    itemRotated = true
                }
            }
        }
        if(tilePositions.length){
            selectedTile = loadoutTile;
            break;
        }
    };

    // Get an array of possible positions for the item to land if nothing was blocking its space
    function getTilePositions(loadoutTile, itemSizeL, itemSizeH){
        // TODO: need a way to 'reserve' certain slots at the tile configuration level, such that the whole slot is used (preferably)
        let itemPositions = []
        for(let rowNum of Array(loadoutTile.height/gridSize).keys()){
            for(let colNum of Array(loadoutTile.width/gridSize).keys()){
                let tilePosition = {
                    "x1": loadoutTile.x + (colNum * gridSize), "y1": loadoutTile.y + (rowNum * gridSize), 
                    "x2": loadoutTile.x + (colNum * gridSize) + (itemSizeL * gridSize), "y2": loadoutTile.y + (rowNum * gridSize) + (itemSizeH * gridSize),
                }
                if((tilePosition.x1 + (itemSizeL * gridSize) <= loadoutTile.x + loadoutTile.width) && (tilePosition.y1 + (itemSizeH * gridSize) <= loadoutTile.y + loadoutTile.height)){
                    itemPositions.push(tilePosition)
                }
            }
        }
        // Find any tokens that may already be over the tile's area
        let blockingTokens = game.canvas.tokens.objects.children.filter(t => t.x >= loadoutTile.x <= (loadoutTile.x + loadoutTile.width) && t.y >= loadoutTile.y <=(loadoutTile.y + loadoutTile.height))

        // Here there be dragons. One liner that filters the potential token creation positions with the spaces blocked by existing tokens.
        // There is something going on here with the use of the myItemSize * gridSize that makes me have to do this extra step of determining 
        // which filter to use...this should be refactorable to a single filter but my brain is refusing to deal with it right now.
        for(let blockingToken of blockingTokens){
                // If the blockingToken is >= the new item, the item should use the filter but with Math.max
            if(blockingToken.w >= itemSizeL * gridSize || blockingToken.h > itemSizeH * gridSize){
                itemPositions = itemPositions.filter(p => 
                    p.x1 >= Math.max(blockingToken.x + blockingToken.w, blockingToken.x + itemSizeL * gridSize) || blockingToken.x >= p.x2 || 
                    p.y1 >= Math.max(blockingToken.y + blockingToken.h, blockingToken.y + itemSizeH * gridSize) || blockingToken.y >= p.y2
                    )
            // If the blockingToken is < the new item, the item should use the filter but with Math.min
            } else {
                itemPositions = itemPositions.filter(p => 
                    p.x1 >= Math.min(blockingToken.x + blockingToken.w, blockingToken.x + itemSizeL * gridSize) || blockingToken.x >= p.x2 || 
                    p.y1 >= Math.min(blockingToken.y + blockingToken.h, blockingToken.y + itemSizeH * gridSize) || blockingToken.y >= p.y2
                    )
            }
        }
        return itemPositions;
    }

    if(! tilePositions.length){
        // TODO: Replace this with a popup dialog box asking if the item should still be placed in the actor's inventory despite not being able to be added to loadout
        ui.notifications.error("unable to find space for " + selectedWeapon.prototypeToken.name + " token in (" + itemSizeX + "," + itemSizeY + ") or (" + itemSizeY + "," + itemSizeX + ")");
        return;
    }

    // Choose an available slot and drop a test token
    //// Someday we should sort this but in the current iteration the earlier indexes are all the 
    //// furthest-upper-left, which is what I want anyway.
    let dropPosition = tilePositions[0]
    let itemActor = game.actors.getName(selectedWeapon.prototypeToken.name)
    var itemTokenDoc
    console.log(itemRotated)
    if(itemRotated == true){
        console.log("creating rotated token")
        itemTokenDoc = await itemActor.getTokenDocument({
            x: dropPosition.x1, y: dropPosition.y1, width: itemSizeY, height: itemSizeX, 
            rotation: 90, texture: {scaleX: itemSizeY, scaleY: itemSizeY}, flags: {loadout: {"item": itemDocument.id}}})
    } else {
        itemTokenDoc = await itemActor.getTokenDocument({x: dropPosition.x1, y: dropPosition.y1, width: itemSizeX, height: itemSizeY, flags: {loadout: {"item": itemDocument.id}}})
    }
    const addedToken = await testScene.createEmbeddedDocuments("Token", [itemTokenDoc])
    if(selectedTile.flags.loadout.state == "owned"){
        ui.notifications.warn("Added " + selectedWeapon.prototypeToken.name + " to " + itemDocument.parent.name + "'s " + selectedTile.flags.loadout.type + ", which is not carried")
    } else {
        ui.notifications.info("Added " + selectedWeapon.prototypeToken.name + " to " + itemDocument.parent.name + "'s " + selectedTile.flags.loadout.type)
    }

}

Hooks.off("createItem");