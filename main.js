var v = Object.defineProperty;
var k = Object.getOwnPropertyDescriptor;
var I = Object.getOwnPropertyNames;
var $ = Object.prototype.hasOwnProperty;
var L = (o, i) => { for (var e in i) v(o, e, { get: i[e], enumerable: !0 }) };
var y = (o, i, e, n) => { if (i && typeof i == "object" || typeof i == "function") for (let r of I(i)) !$.call(o, r) && r !== e && v(o, r, { get: () => i[r], enumerable: !(n = k(i, r)) || n.enumerable }); return o };
var E = o => y(v({}, "__esModule", { value: !0 }), o);
var C = {};
L(C, { default: () => f });
module.exports = E(C);

var w = require("obsidian");

const MARKUP_STOP_CHARS = "|*-_`#>~[]()!\\/:;,.?\"“”‘’'".split("");
const TRAILING_OK_CHARS = ["s", ",", "."];

function getTrimIndices(str) {
    let start = 0, end = str.length;
    while (start < end && (MARKUP_STOP_CHARS.includes(str[start]) || /\s/.test(str[start]))) start++;
    while (end > start && (MARKUP_STOP_CHARS.includes(str[end - 1]) || /\s/.test(str[end - 1]))) end--;
    let extraEnd = end;
    while (extraEnd > start && TRAILING_OK_CHARS.includes(str[extraEnd - 1])) extraEnd--;
    if (extraEnd !== end && extraEnd !== start) end = extraEnd + 1;
    return [start, end];
}

function splitPhraseLinkAndSurrounding(phrase) {
    let [start, end] = getTrimIndices(phrase);
    return [
        phrase.slice(0, start),
        phrase.slice(start, end),
        phrase.slice(end)
    ];
}

function phraseToNorm(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Only prevent self-linking for singular/plural/possessive forms too.
function isSelfLink(norm, curKey) {
    if (norm === curKey) return true;
    if (norm === curKey + "s") return true;
    if (norm === curKey.slice(0, -1) && curKey.endsWith("s")) return true;
    if (norm === curKey + "es") return true;
    if (norm === curKey + "'s") return true;
    if (norm === curKey + "s'") return true;
    if (norm === curKey.slice(0, -1) + "'s" && curKey.endsWith("s")) return true;
    if (norm === curKey.slice(0, -1) + "s'" && curKey.endsWith("s")) return true;
    return false;
}

function isTableLine(line) {
    if (!line.includes('|')) return false;
    if (/^\s*\|?[\s:-]+\|[\s:-]+\|?[\s:-]*$/.test(line)) return false;
    return (line.match(/\|/g) || []).length > 1;
}

function makeEscapedPipeLink(page, display) {
    return `[[${page}\\|${display}]]`;
}

function splitUnlinkableRegions(text) {
    let out = [];
    let i = 0, start = 0, n = text.length;
    while (i < n) {
        if (text[i] === "[" && text[i + 1] === "[") {
            if (i > start) out.push([true, text.slice(start, i)]);
            let depth = 1;
            let j = i + 2;
            while (j < n) {
                if (text[j] === "[" && text[j + 1] === "[") {
                    depth++;
                    j += 2;
                } else if (text[j] === "]" && text[j + 1] === "]") {
                    depth--;
                    j += 2;
                    if (depth === 0) break;
                } else {
                    j++;
                }
            }
            out.push([false, text.slice(i, j)]);
            i = j;
            start = i;
            continue;
        }
        if (text[i] === "`") {
            if (i > start) out.push([true, text.slice(start, i)]);
            let j = i + 1;
            while (j < n && text[j] !== "`") j++;
            j = (j < n) ? j + 1 : n;
            out.push([false, text.slice(i, j)]);
            i = j;
            start = i;
            continue;
        }
        i++;
    }
    if (start < n) out.push([true, text.slice(start, n)]);
    return out;
}

function relinkTextRegion(text, curKey, index, settings) {
    if (/^\s*\[\[.*\]\]\s*$/.test(text)) return text;
    let maxWords = 6, out = "", i = 0;
    while (i < text.length) {
        let wsMatch = text.slice(i).match(/^\s+/);
        let ws = wsMatch ? wsMatch[0] : "";
        let wsOffset = ws.length;
        let matched = false;
        let tokens = [];
        let matchAll = Array.from(text.slice(i + wsOffset).matchAll(/\S+\s*/g));
        for (let x of matchAll) {
            tokens.push({ text: x[0], start: x.index + i + wsOffset });
        }
        for (let w = Math.min(maxWords, tokens.length); w >= 1; w--) {
            let candidateTokens = tokens.slice(0, w);
            if (!candidateTokens.length) continue;
            let phrase = candidateTokens.map(t => t.text).join("");
            let phraseStart = i + wsOffset;
            let phraseEnd = phraseStart + phrase.length;
            let [leading, linkPhrase, trailing] = splitPhraseLinkAndSurrounding(phrase);
            if (!linkPhrase) continue;
            let norm = phraseToNorm(linkPhrase);
            if (settings.preventSelfLink && isSelfLink(norm, curKey)) continue;
            if (!norm) continue;
            if (!index.has(norm)) continue;
            let linkText = index.get(norm);

            if (/#/.test(linkText)) {
                if (!settings.linkToLocalHeadings && !settings.linkToExternalHeadings) continue;
                let target = linkText.slice(2, linkText.indexOf("#"));
                if (settings.linkToLocalHeadings && !settings.linkToExternalHeadings) {
                    if (phraseToNorm(target) !== curKey) continue;
                }
                if (!settings.linkToLocalHeadings && settings.linkToExternalHeadings) {
                    if (phraseToNorm(target) === curKey) continue;
                }
            }

            let target = linkText.slice(2, -2);
            let replacement = makeEscapedPipeLink(target, linkPhrase);
            let afterPhrase = "";
            let afterIdx = phraseEnd;
            while (afterIdx < text.length && /\s/.test(text[afterIdx])) {
                afterPhrase += text[afterIdx];
                afterIdx++;
            }
            out += ws + leading + replacement + trailing + afterPhrase;
            i = phraseEnd + afterPhrase.length;
            matched = true;
            break;
        }
        if (!matched) {
            out += text[i];
            i++;
        }
    }
    return out;
}

function splitTableLineSafe(line) {
    let cells = [];
    let cur = "";
    let inLink = 0;
    let inCode = false;
    for (let i = 0; i < line.length; i++) {
        if (!inCode && line[i] === "[" && line[i + 1] === "[") {
            inLink++;
            cur += "[[";
            i++;
            continue;
        }
        if (!inCode && line[i] === "]" && line[i + 1] === "]" && inLink > 0) {
            inLink--;
            cur += "]]";
            i++;
            continue;
        }
        if (line[i] === "`") {
            inCode = !inCode;
            cur += "`";
            continue;
        }
        if (line[i] === "|" && inLink === 0 && !inCode) {
            cells.push(cur);
            cur = "";
            continue;
        }
        cur += line[i];
    }
    cells.push(cur);
    return cells;
}

function relinkCell(cell, curKey, index, settings) {
    let out = "";
    let i = 0;
    while (i < cell.length) {
        if (cell[i] === '[' && cell[i + 1] === '[') {
            let start = i;
            i += 2;
            let depth = 1;
            while (i < cell.length && depth > 0) {
                if (cell[i] === '[' && cell[i + 1] === '[') {
                    depth++;
                    i += 2;
                } else if (cell[i] === ']' && cell[i + 1] === ']' && depth > 0) {
                    depth--;
                    i += 2;
                    if (depth === 0) break;
                } else {
                    i++;
                }
            }
            out += cell.slice(start, i);
            continue;
        }
        if (cell[i] === '`') {
            let start = i;
            i++;
            while (i < cell.length && cell[i] !== '`') i++;
            i = (i < cell.length) ? i + 1 : i;
            out += cell.slice(start, i);
            continue;
        }
        let start = i;
        while (
            i < cell.length &&
            !(cell[i] === '[' && cell[i + 1] === '[') &&
            cell[i] !== '`'
        ) {
            i++;
        }
        if (start < i) {
            out += relinkTextRegion(cell.slice(start, i), curKey, index, settings);
        }
    }
    return out;
}

function linkLine(line, curKey, index, settings) {
    if (/^`[^`]*`$/.test(line)) return line;
    if (/^\s*\[\[[^\]]+\]\]\s*$/.test(line)) return line;
    if (isTableLine(line)) {
        let cells = splitTableLineSafe(line);
        let out = "";
        for (let c = 0; c < cells.length; c++) {
            if (c > 0) out += "|";
            out += relinkCell(cells[c], curKey, index, settings);
        }
        return out;
    }
    let regions = splitUnlinkableRegions(line);
    let out = "";
    for (let [isLinkable, text] of regions) {
        if (isLinkable) out += relinkTextRegion(text, curKey, index, settings);
        else out += text;
    }
    return out;
}

var f = class extends w.Plugin {
    constructor() {
        super(...arguments);
        this.index = new Map;
        this.intervalId = null;
        this.settings = {
            autolinkOnSave: false,
            autolinkOnEdit: true,
            preventSelfLink: true,
            linkToLocalHeadings: false,
            linkToExternalHeadings: false,
            ignoredFolders: []
        };
    }

    async onload() {
        await this.loadSettings();
        this.app.workspace.onLayoutReady(async () => { await this.buildIndex() });

        this.registerEvent(this.app.workspace.on("editor-change", editor => {
            if (this.settings.autolinkOnEdit) {
                this.handleEditorChange(editor);
            }
        }));

        this.registerEvent(this.app.vault.on("modify", async file => {
            if (
                this.settings.autolinkOnSave &&
                file instanceof w.TFile &&
                file.extension === "md" &&
                this.app.workspace.getActiveFile()?.path === file.path
            ) {
                let editor = this.app.workspace.activeEditor?.editor;
                if (editor) this.autolinkWholeFile(editor);
            }
        }));

        this.intervalId = window.setInterval(() => {
            this.buildIndex()
        }, 300000);

        this.registerEvent(this.app.vault.on("modify", e => {
            e instanceof w.TFile && e.extension === "md" && this.buildIndex()
        }));

        this.addCommand({
            id: "smart-autolinker-autolink-all",
            name: "Auto-link current file",
            editorCallback: editor => { this.autolinkWholeFile(editor); }
        });

        this.addCommand({
            id: "smart-autolinker-autolink-project",
            name: "Auto-link ALL markdown files in vault",
            callback: async () => { await this.autolinkWholeProject(); }
        });

        this.addSettingTab(new class extends w.PluginSettingTab {
            constructor(plugin) { super(plugin.app, plugin); this.plugin = plugin; }
            display() {
                let { containerEl } = this;
                containerEl.empty();
                containerEl.createEl("h2", { text: "Auto Linker Settings" });

                new w.Setting(containerEl)
                    .setName("Auto-link on edit")
                    .setDesc("Auto-link relevant phrases in the current line as you type.")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.autolinkOnEdit)
                        .onChange(async value => {
                            this.plugin.settings.autolinkOnEdit = value;
                            await this.plugin.saveSettings();
                        }));

                new w.Setting(containerEl)
                    .setName("Auto-link on file save")
                    .setDesc("Auto-link all phrases in current file every time you save.")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.autolinkOnSave)
                        .onChange(async value => {
                            this.plugin.settings.autolinkOnSave = value;
                            await this.plugin.saveSettings();
                        }));

                new w.Setting(containerEl)
                    .setName("Prevent self-linking")
                    .setDesc("Prevent linking to the current page (including prefixes/suffixes, e.g. 'Keter', 'Keter's', 'Keters' if current page is 'Keter').")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.preventSelfLink)
                        .onChange(async value => {
                            this.plugin.settings.preventSelfLink = value;
                            await this.plugin.saveSettings();
                        }));

                new w.Setting(containerEl)
                    .setName("Link to headings in current file")
                    .setDesc("Allow auto-linking to headings in the current file.")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.linkToLocalHeadings)
                        .onChange(async value => {
                            this.plugin.settings.linkToLocalHeadings = value;
                            await this.plugin.saveSettings();
                        }));

                new w.Setting(containerEl)
                    .setName("Link to headings in other files")
                    .setDesc("Allow auto-linking to headings in other files.")
                    .addToggle(toggle => toggle
                        .setValue(this.plugin.settings.linkToExternalHeadings)
                        .onChange(async value => {
                            this.plugin.settings.linkToExternalHeadings = value;
                            await this.plugin.saveSettings();
                        }));

                new w.Setting(containerEl)
                    .setName("Ignored folders")
                    .setDesc("Comma-separated list of folder names to ignore during indexing. All notes inside will be skipped.")
                    .addText(text => text
                        .setValue((this.plugin.settings.ignoredFolders || []).join(", "))
                        .onChange(async value => {
                            this.plugin.settings.ignoredFolders = value.split(",").map(s => s.trim()).filter(Boolean);
                            await this.plugin.saveSettings();
                        }));
            }
        }(this));
    }

    onunload() {
        this.intervalId && window.clearInterval(this.intervalId);
    }

    async loadSettings() {
        let data = await this.loadData();
        if (data) this.settings = Object.assign({}, this.settings, data);
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async buildIndex() {
        this.index.clear();
        const fileMap = new Map();
        let files = this.app.vault.getMarkdownFiles();
        let ignored = (this.settings.ignoredFolders || []).map(f => f.toLowerCase());

        // Pass 1: index files and singular/plural forms
        for (let file of files) {
            // Skip if inside any ignored folder
            let folder = file.parent?.path?.toLowerCase() || "";
            if (ignored.some(name => folder.split("/").includes(name))) continue;

            let title = file.basename.trim();
            let normTitle = phraseToNorm(title);
            let link = `[[${title}]]`;
            fileMap.set(normTitle, link);

            // Plural/singular (only if not the same)
            if (normTitle.endsWith("s")) {
                let singular = normTitle.slice(0, -1);
                if (!fileMap.has(singular)) fileMap.set(singular, link);
            } else {
                let plural = normTitle + "s";
                if (!fileMap.has(plural)) fileMap.set(plural, link);
            }
        }

        // Add fileMap to the main index first
        for (let [k, v] of fileMap) this.index.set(k, v);

        // Pass 2: index headings and blocks only if not present in fileMap
        for (let file of files) {
            let folder = file.parent?.path?.toLowerCase() || "";
            if (ignored.some(name => folder.split("/").includes(name))) continue;

            let lines = (await this.app.vault.read(file)).split("\n");
            let title = file.basename.trim();

            for (let line of lines) {
                let h = line.match(/^(#+)\s+(.*)/);
                if (h) {
                    let hdr = h[2].trim(),
                        normHdr = phraseToNorm(hdr),
                        lnkHdr = `[[${title}#${hdr}]]`;
                    if (!fileMap.has(normHdr) && !this.index.has(normHdr))
                        this.index.set(normHdr, lnkHdr);

                    // Plural/singular for heading
                    if (normHdr.endsWith("s")) {
                        let singular = normHdr.slice(0, -1);
                        if (!fileMap.has(singular) && !this.index.has(singular))
                            this.index.set(singular, lnkHdr);
                    } else {
                        let plural = normHdr + "s";
                        if (!fileMap.has(plural) && !this.index.has(plural))
                            this.index.set(plural, lnkHdr);
                    }
                }
                let blk = /\^([\w-]+)/g, m;
                while ((m = blk.exec(line)) !== null) {
                    let id = m[1],
                        normId = id.toLowerCase(),
                        lnkBlk = `[[${title}#^${id}]]`;
                    if (!fileMap.has("^" + normId) && !this.index.has("^" + normId))
                        this.index.set("^" + normId, lnkBlk);
                }
            }
        }
    }

    buildLocalHeadingIndex(file, lines) {
        const index = new Map();
        const fileMap = new Map();
        let title = file.basename.trim();
        let normTitle = phraseToNorm(title);
        let link = `[[${title}]]`;

        // File name + singular/plural forms
        fileMap.set(normTitle, link);
        if (normTitle.endsWith("s")) {
            let singular = normTitle.slice(0, -1);
            if (!fileMap.has(singular)) fileMap.set(singular, link);
        } else {
            let plural = normTitle + "s";
            if (!fileMap.has(plural)) fileMap.set(plural, link);
        }

        // Add fileMap to local index first
        for (let [k, v] of fileMap) index.set(k, v);

        // Headings/blocks, but skip any that collide with file name/singular/plural
        for (let line of lines) {
            let h = line.match(/^(#+)\s+(.*)/);
            if (h) {
                let hdr = h[2].trim(),
                    normHdr = phraseToNorm(hdr),
                    lnkHdr = `[[${title}#${hdr}]]`;
                if (!fileMap.has(normHdr) && !index.has(normHdr))
                    index.set(normHdr, lnkHdr);

                if (normHdr.endsWith("s")) {
                    let singular = normHdr.slice(0, -1);
                    if (!fileMap.has(singular) && !index.has(singular))
                        index.set(singular, lnkHdr);
                } else {
                    let plural = normHdr + "s";
                    if (!fileMap.has(plural) && !index.has(plural))
                        index.set(plural, lnkHdr);
                }
            }
            let blk = /\^([\w-]+)/g, m;
            while ((m = blk.exec(line)) !== null) {
                let id = m[1],
                    normId = id.toLowerCase(),
                    lnkBlk = `[[${title}#^${id}]]`;
                if (!fileMap.has("^" + normId) && !index.has("^" + normId))
                    index.set("^" + normId, lnkBlk);
            }
        }
        return index;
    }

handleEditorChange(e) {
    let pos = e.getCursor();
    let line = e.getLine(pos.line);
    let file = this.app.workspace.getActiveFile();
    if (!file) return;
    let curKey = phraseToNorm(file.basename.trim());

    // --- START: Code block check ---
    let inCodeBlock = false;
    let lines = [];
    for (let i = 0; i < e.lineCount(); i++) {
        let l = e.getLine(i);
        lines.push(l);
        if (/^\s*```/.test(l)) inCodeBlock = !inCodeBlock;
        if (i === pos.line && inCodeBlock) return;
    }
    // --- END: Code block check ---

    let localIndex = this.buildLocalHeadingIndex(file, lines);
    let index = this.index;

    if (pos.ch === 0 && pos.line > 0) {
        let prevLineNum = pos.line - 1;
        let prevLine = e.getLine(prevLineNum);

        // Previous line code block check
        inCodeBlock = false;
        for (let i = 0; i <= prevLineNum; i++) {
            let l = e.getLine(i);
            if (/^\s*```/.test(l)) inCodeBlock = !inCodeBlock;
        }
        if (inCodeBlock) return;

        if (prevLine && !/^\s*#+\s+/.test(prevLine)) {
            let fullLine = prevLine;
            let cursorCh = prevLine.length;
            let maxWords = 5;
            let linkPattern = /\[\[([^\|\[\]]+)(?:\\?\|([^\[\]]+))?\]\]/g;
            let lastLink, lastLinkIndex, linkMatch;
            while ((linkMatch = linkPattern.exec(fullLine)) !== null) {
                if (linkMatch.index + linkMatch[0].length <= cursorCh) {
                    lastLink = linkMatch;
                    lastLinkIndex = linkMatch.index;
                } else {
                    break;
                }
            }
            if (lastLink) {
                let base = lastLink[2] || lastLink[1];
                let afterLinkStart = lastLinkIndex + lastLink[0].length;
                let afterText = fullLine.slice(afterLinkStart, cursorCh);
                let afterWords = afterText.match(/([\w\-']+)/g) || [];
                let rightText = fullLine.slice(cursorCh);
                let rightWords = rightText.match(/^((?:\s+[\w\-']+){0,5})/);
                if (rightWords && rightWords[1]) {
                    afterWords = afterWords.concat(rightWords[1].trim().split(/\s+/).filter(Boolean));
                }
                for (let n = Math.min(maxWords, afterWords.length); n >= 1; n--) {
                    let phrase = (base + ' ' + afterWords.slice(0, n).join(' ')).trim();
                    let norm = phraseToNorm(phrase);
                    if (this.settings.preventSelfLink && isSelfLink(norm, curKey)) continue;
                    if (!norm) continue;
                    if (index.has(norm)) {
                        let linkText = index.get(norm);
                        if (/#/.test(linkText)) {
                            let target = linkText.slice(2, linkText.indexOf("#"));
                            if (!this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) continue;
                            if (this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) {
                                if (phraseToNorm(target) !== curKey) continue;
                            }
                            if (!this.settings.linkToLocalHeadings && this.settings.linkToExternalHeadings) {
                                if (phraseToNorm(target) === curKey) continue;
                            }
                        }
                        let longer = false;
                        for (let m = afterWords.length; m > n; m--) {
                            let longerPhrase = (base + ' ' + afterWords.slice(0, m).join(' ')).trim();
                            if (index.has(phraseToNorm(longerPhrase))) {
                                longer = true;
                                break;
                            }
                        }
                        if (longer) continue;
                        let target = linkText.slice(2, -2);
                        let start = lastLinkIndex;
                        let end = afterLinkStart, rest = fullLine.slice(afterLinkStart), count = 0, i = 0;
                        while (count < n && i < rest.length) {
                            while (i < rest.length && /\s/.test(rest[i])) i++;
                            while (i < rest.length && /\S/.test(rest[i])) i++;
                            count++;
                        }
                        end = afterLinkStart + i;
                        let newLink = makeEscapedPipeLink(target, phrase);
                        e.replaceRange(
                            newLink,
                            { line: prevLineNum, ch: start },
                            { line: prevLineNum, ch: end }
                        );
                        return;
                    }
                }
            }

            let tokens = Array.from(prevLine.matchAll(/\S+\s*/g)).map(x => ({ text: x[0], start: x.index, end: x.index + x[0].length }));
            let linkPat = /\[\[[^\]]+\]\]/g, linkRanges = [], m2;
            while ((m2 = linkPat.exec(prevLine)) !== null) linkRanges.push([m2.index, m2.index + m2[0].length]);
            let codePat = /`[^`]*`/g, codeRanges = [];
            while ((m2 = codePat.exec(prevLine)) !== null) codeRanges.push([m2.index, m2.index + m2[0].length]);
            let skipRanges = linkRanges.concat(codeRanges);

            let linked = false;
            for (let w = Math.min(6, tokens.length); w >= 1 && !linked; w--) {
                let candidateTokens = tokens.slice(-w);
                let phrase = candidateTokens.map(t => t.text).join("").replace(/\s+$/, "");
                let [leading, linkPhrase, trailing] = splitPhraseLinkAndSurrounding(phrase);
                if (!linkPhrase) continue;
                let norm = phraseToNorm(linkPhrase);
                if (this.settings.preventSelfLink && isSelfLink(norm, curKey)) continue;
                if (!norm) continue;
                if (!index.has(norm)) continue;
                let linkText = index.get(norm);
                if (/#/.test(linkText)) {
                    let target = linkText.slice(2, linkText.indexOf("#"));
                    if (!this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) continue;
                    if (this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) {
                        if (phraseToNorm(target) !== curKey) continue;
                    }
                    if (!this.settings.linkToLocalHeadings && this.settings.linkToExternalHeadings) {
                        if (phraseToNorm(target) === curKey) continue;
                    }
                }
                let target = linkText.slice(2, -2);
                let start = candidateTokens[0].start;
                let end = start + phrase.length;
                if (skipRanges.some(([l, r]) => start < r && end > l)) continue;
                let replacement = makeEscapedPipeLink(target, linkPhrase);
                e.replaceRange(
                    leading + replacement + trailing,
                    { line: prevLineNum, ch: start },
                    { line: prevLineNum, ch: end }
                );
                linked = true;
            }
        }
        return;
    }

    if (!line) return;
    if (/^\s*#+\s+/.test(line)) return;
    if (pos.ch === 0 || !/[\s.,!?:;]/.test(line.charAt(pos.ch - 1))) return;

    let fullLine = line;
    let cursorCh = pos.ch;

    let maxWords = 5;
    let linkPattern = /\[\[([^\|\[\]]+)(?:\\?\|([^\[\]]+))?\]\]/g;
    let lastLink, lastLinkIndex, linkMatch;
    while ((linkMatch = linkPattern.exec(fullLine)) !== null) {
        if (linkMatch.index + linkMatch[0].length <= cursorCh) {
            lastLink = linkMatch;
            lastLinkIndex = linkMatch.index;
        } else {
            break;
        }
    }
    if (lastLink) {
        let base = lastLink[2] || lastLink[1];
        let afterLinkStart = lastLinkIndex + lastLink[0].length;
        let afterText = fullLine.slice(afterLinkStart, cursorCh);
        let afterWords = afterText.match(/([\w\-']+)/g) || [];
        let rightText = fullLine.slice(cursorCh);
        let rightWords = rightText.match(/^((?:\s+[\w\-']+){0,5})/);
        if (rightWords && rightWords[1]) {
            afterWords = afterWords.concat(rightWords[1].trim().split(/\s+/).filter(Boolean));
        }
        for (let n = Math.min(maxWords, afterWords.length); n >= 1; n--) {
            let phrase = (base + ' ' + afterWords.slice(0, n).join(' ')).trim();
            let norm = phraseToNorm(phrase);
            if (this.settings.preventSelfLink && isSelfLink(norm, curKey)) continue;
            if (!norm) continue;
            if (index.has(norm)) {
                let linkText = index.get(norm);
                if (/#/.test(linkText)) {
                    let target = linkText.slice(2, linkText.indexOf("#"));
                    if (!this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) continue;
                    if (this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) {
                        if (phraseToNorm(target) !== curKey) continue;
                    }
                    if (!this.settings.linkToLocalHeadings && this.settings.linkToExternalHeadings) {
                        if (phraseToNorm(target) === curKey) continue;
                    }
                }
                let longer = false;
                for (let m = afterWords.length; m > n; m--) {
                    let longerPhrase = (base + ' ' + afterWords.slice(0, m).join(' ')).trim();
                    if (index.has(phraseToNorm(longerPhrase))) {
                        longer = true;
                        break;
                    }
                }
                if (longer) continue;
                let target = linkText.slice(2, -2);
                let start = lastLinkIndex;
                let end = afterLinkStart, rest = fullLine.slice(afterLinkStart), count = 0, i = 0;
                while (count < n && i < rest.length) {
                    while (i < rest.length && /\s/.test(rest[i])) i++;
                    while (i < rest.length && /\S/.test(rest[i])) i++;
                    count++;
                }
                end = afterLinkStart + i;
                let newLink = makeEscapedPipeLink(target, phrase);
                e.replaceRange(
                    newLink,
                    { line: pos.line, ch: start },
                    { line: pos.line, ch: end }
                );
                return;
            }
        }
    }

    let tokens = Array.from(line.slice(0, pos.ch).matchAll(/\S+\s*/g)).map(x => ({ text: x[0], start: x.index, end: x.index + x[0].length }));
    let linkPat = /\[\[[^\]]+\]\]/g, linkRanges = [], m2;
    while ((m2 = linkPat.exec(line)) !== null) linkRanges.push([m2.index, m2.index + m2[0].length]);
    let codePat = /`[^`]*`/g, codeRanges = [];
    while ((m2 = codePat.exec(line)) !== null) codeRanges.push([m2.index, m2.index + m2[0].length]);
    let skipRanges = linkRanges.concat(codeRanges);

    let linked = false;
    for (let w = Math.min(6, tokens.length); w >= 1 && !linked; w--) {
        let candidateTokens = tokens.slice(-w);
        let phrase = candidateTokens.map(t => t.text).join("").replace(/\s+$/, "");
        let [leading, linkPhrase, trailing] = splitPhraseLinkAndSurrounding(phrase);
        if (!linkPhrase) continue;
        let norm = phraseToNorm(linkPhrase);
        if (this.settings.preventSelfLink && isSelfLink(norm, curKey)) continue;
        if (!norm) continue;
        if (!index.has(norm)) continue;
        let linkText = index.get(norm);
        if (/#/.test(linkText)) {
            let target = linkText.slice(2, linkText.indexOf("#"));
            if (!this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) continue;
            if (this.settings.linkToLocalHeadings && !this.settings.linkToExternalHeadings) {
                if (phraseToNorm(target) !== curKey) continue;
            }
            if (!this.settings.linkToLocalHeadings && this.settings.linkToExternalHeadings) {
                if (phraseToNorm(target) === curKey) continue;
            }
        }
        let target = linkText.slice(2, -2);
        let start = candidateTokens[0].start;
        let end = start + phrase.length;
        if (skipRanges.some(([l, r]) => start < r && end > l)) continue;
        let replacement = makeEscapedPipeLink(target, linkPhrase);
        e.replaceRange(
            leading + replacement + trailing,
            { line: pos.line, ch: start },
            { line: pos.line, ch: end }
        );
        linked = true;
    }
}


    autolinkWholeFile(editor) {
        let file = this.app.workspace.getActiveFile();
        if (!file) return;
        let curKey = phraseToNorm(file.basename.trim());
        let lineCount = editor.lineCount();

        let inCodeBlock = false;

        for (let lineNum = 0; lineNum < lineCount; lineNum++) {
            let line = editor.getLine(lineNum);
            if (/^\s*```/.test(line)) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (/^( {4,}|\t)/.test(line)) continue;
            if (inCodeBlock) continue;
            if (/^\s*#+\s+/.test(line)) continue;
            let linkedLine = linkLine(line, curKey, this.index, this.settings);
            if (linkedLine !== line) {
                editor.replaceRange(linkedLine, { line: lineNum, ch: 0 }, { line: lineNum, ch: line.length });
            }
        }
    }

    async autolinkWholeProject() {
        let files = this.app.vault.getMarkdownFiles();
        let ignored = (this.settings.ignoredFolders || []).map(f => f.toLowerCase());
        for (let file of files) {
            let folder = file.parent?.path?.toLowerCase() || "";
            if (ignored.some(name => folder.split("/").includes(name))) continue;

            let data = await this.app.vault.read(file);
            let lines = data.split("\n");
            let curKey = phraseToNorm(file.basename.trim());
            let changed = false;
            let result = [];
            let inCodeBlock = false;
            for (let line of lines) {
                if (/^\s*```/.test(line)) {
                    inCodeBlock = !inCodeBlock;
                    result.push(line);
                    continue;
                }
                if (/^( {4,}|\t)/.test(line)) {
                    result.push(line);
                    continue;
                }
                if (inCodeBlock) {
                    result.push(line);
                    continue;
                }
                let linkedLine = linkLine(line, curKey, this.index, this.settings);
                if (linkedLine !== line) changed = true;
                result.push(linkedLine);
            }
            if (changed) {
                await this.app.vault.modify(file, result.join("\n"));
            }
        }
    }
};
