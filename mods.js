/**
 * 
 * @param {FileSystemDirectoryHandle} dir 
 * @returns {Promise<boolean>}
 */
async function isMod(dir) {
    try {
        await dir.getFileHandle("lovely.toml")
        return true
    } catch {
        try {
            await dir.getDirectoryHandle("lovely")
            return true
        } catch {
            return false
        }
    }
}

/**
 * 
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Promise<Object>}
 */
async function directoryToObject(dir, isRoot=false, showCompatibleWarning=true) {
    if (isRoot) {
        try {
            await dir.getFileHandle("webcompatible")
        } catch (err) {
            if (showCompatibleWarning) {
                alert("Mod " + dir.name + " may not be web compatible.")
            }
        }
    }
    const object = {}
    for await (const [path, obj] of dir.entries()) {
        if (obj.kind == "directory") {
            object[path] = await directoryToObject(obj)
        } else {
            object[path] = await obj.getFile()
        }
    }
    return object
}

let mods = {}

async function addModDir() {
    $("makeName").placeholder = "Modded"

    /** @type {FileSystemDirectoryHandle} */
    const dir_picker = await showDirectoryPicker({
        mode: "read",
        startIn: "downloads"
    });

    if (await isMod(dir_picker)) {
        mods[dir_picker.name] = await directoryToObject(dir_picker, true)
    } else {
        for await (const [path, obj] of dir_picker.entries()) {
            if (obj.kind == "directory") {
                mods[obj.name] = await directoryToObject(obj, true)
            }
        }
    }
    renderModsList()
}

function clearMods() {
    mods = {}
    renderModsList()
}

function renderModsList() {
    const list = $("mod-list");
    list.innerHTML = "";
    for (const mod_name of Object.keys(mods)) {
        const mod_item = document.createElement("label");
        mod_item.innerText = mod_name;

        if (mods["Dump from Lovely"] && mod_name != "Dump from Lovely") {
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = false;
            checkbox.onchange = function() {
                if (checkbox.checked) {
                    mods[mod_name]["dont_patch.txt"] = new File(["true"], "dont_patch.txt", { type: "text/plain" })
                }
            }
            mod_item.prepend(checkbox);
        }

        list.appendChild(mod_item);

        list.appendChild(document.createElement("br"));
    }
}

async function useLovelyDump() {
    // Open a folder picker
    const dir_picker = await showDirectoryPicker({
        mode: "read",
        startIn: "downloads"
    });

    mods["Dump from Lovely"] = await directoryToObject(dir_picker, true, false)

    alert("Click the checkboxes next to the mods that were in provided dump.")

    renderModsList()
}

// ---------------------- LUA VM.JS MOD EXECUTION & SMOD EMULATION -----------------------

/**
 * Checks for LuaJIT/FFI or unsupported APIs in a Lua script.
 * @param {string} scriptText
 * @returns {boolean}
 */
function isLuaJITOnly(scriptText) {
    return /require\s*\(\s*["']ffi["']\s*\)/.test(scriptText) || /\bjit\b/.test(scriptText);
}

/**
 * Run a Lua mod script in the browser using lua.vm.js, stubbing Lovely APIs.
 * @param {string} modName
 * @param {string} scriptText
 */
function runLuaModScript(modName, scriptText) {
    if (!window.Lua) {
        alert("Lua VM is not loaded. Please ensure lua.vm.js is included in your HTML.");
        return;
    }

    // Warn/block LuaJIT/FFI usage
    if (isLuaJITOnly(scriptText)) {
        alert(`Mod "${modName}" uses LuaJIT/FFI or jit APIs and cannot be run in the browser.`);
        return;
    }

    var L = Lua.State();

    // Provide a global "lovely" table with basic logging and stub APIs
    Lua.execute(L, `
        lovely = {
            log = function(msg) js.global:console():log("[lovely][" .. tostring(msg) .. "]") end,
            warn = function(msg) js.global:console():warn("[lovely][" .. tostring(msg) .. "]") end,
            config = {}
        }
    `);

    // Run the mod script (catch errors)
    try {
        Lua.execute(L, scriptText);
    } catch (e) {
        console.error(`Error running mod ${modName}:`, e);
        alert(`Error running mod "${modName}": ${e}`);
    }
}

/**
 * Recursively run all Lua scripts in loaded mods.
 */
async function runAllModLuaScripts() {
    for (const modName of Object.keys(mods)) {
        const modObj = mods[modName];
        // Recursively find .lua files
        async function processDir(obj, path = "") {
            for (const [key, value] of Object.entries(obj)) {
                if (value instanceof File && key.endsWith(".lua")) {
                    const text = await value.text();
                    runLuaModScript(modName, text);
                } else if (typeof value === "object") {
                    await processDir(value, path + "/" + key);
                }
            }
        }
        await processDir(modObj);
    }
}

// Example: You could call runAllModLuaScripts() after mods are loaded/imported, or hook it into your build/run workflow.
