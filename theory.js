import { BigNumber } from '../api/BigNumber';
import { CompositeCost, ExponentialCost, FirstFreeCost, FreeCost, LinearCost } from '../api/Costs';
import { Localization } from '../api/Localization';
import { theory } from '../api/Theory';
import { ui } from '../api/ui/UI';
import { Utils } from '../api/Utils';
import { StackOrientation } from '../api/ui/properties/StackOrientation';
import { TextAlignment } from '../api/ui/properties/TextAlignment';
import { LayoutOptions } from '../api/ui/properties/LayoutOptions';

var id = 'logistic_map';
var getName = (language) =>
{
    let names =
    {
        en: 'Logistic Map',
    };

    return names[language] ?? names.en;
}
var getDescription = (language) =>
{
    let descs =
    {
        en: 'The growth of populations, explained in one simple function.',
    };

    return descs[language] ?? descs.en;
}
var authors = 'propfeds';
var version = 0.1;

const versionName = 'v0.1';
const workInProgress = false;

const locStrings =
{
    en:
    {
        wip: '{0} (Work in Progress)',
        pubTime: 'Time: {0}',
        lyapunov: 'the Lyapunov exponent',
        reseed: 'Reseeds the population',
        reset: 'Refund {0} ({1})',
        max: 'max',
        resetrInfo: 'Refunds all levels of {0}',
        autoSeed: 'Auto-reseeder',
        autoSeedInfo: `Automatically reseeds when {0} reaches a specified
value`,
        autoSeedLabel: 'Reseed when: {0}'
    }
};

const menuLang = Localization.language;
/**
 * Returns a localised string.
 * @param {string} name the internal name of the string.
 * @returns {string} the string.
 */
let getLoc = (name, lang = menuLang) =>
{
    if(lang in locStrings && name in locStrings[lang])
        return locStrings[lang][name];

    if(name in locStrings.en)
        return locStrings.en[name];
    
    return `String missing: ${lang}.${name}`;
}

const x0 = 0.25;
const cooldown = 12;
let getLyapunovExp = (sum, t) => t ? sum / t : 0;

let pubTime = 0;
let turns = 0;
let time = 0;
let x = x0;
let lyapunovExpSum = 0;
let lyapunovExp = getLyapunovExp(lyapunovExpSum, turns);
let autoSeed = -1;
let autoSeedActive = false;

const c1Cost = new FirstFreeCost(new ExponentialCost(10, 0.5));
const getc1 = (level) => Utils.getStepwisePowerSum(level, 2, 9, 1);
const c1ExpMaxLevel = 4;
const c1ExpInc = 0.03;
const getc1Exp = (level) => 1 + c1ExpInc * level;

const c2Cost = new ExponentialCost(50 * Math.sqrt(10), 0.5 * 4);
const c2Base = BigNumber.TWO;
const getc2 = (level) => c2Base.pow(level);

const xExpMaxLevel = 40;
const xExpCost = new ExponentialCost(100, 9);
let getxTermExp = (xLv, lyaLv) =>
{
    let l = lyaLv ? 1 + lyapunovExp : 0;
    return 1 + xLv + l;
};
let getxTermExpNoLambda = (xLv, lyaLv) => 1 + xLv + lyaLv;

const rMaxLevel = 45;
const rCost = new CompositeCost(5, new ExponentialCost(1e2, Math.log2(1e2)),
new CompositeCost(4, new ExponentialCost(1e20, Math.log2(1e5)),
new CompositeCost(10, new ExponentialCost(1e50, Math.log2(1e6)),
new CompositeCost(8, new ExponentialCost(1e125, Math.log2(10 ** 7.5)),
new CompositeCost(8, new ExponentialCost(1e200, Math.log2(1e9)),
new CompositeCost(9, new ExponentialCost(1e280, Math.log2(1e10)),
new ConstantCost(BigNumber.from('1e400'))))))));
const getr = (level) => level >= 45 ? 4 :
(level >= 35 ? 3.8 + (level-35)/50 :
(level >= 19 ? 3 + (level-19)/20 :
(level >= 9 ? 2 + (level-9)/10 :
(level >= 4 ? 1 + (level-4)/5 : level/4))));
/*
0, 0.25 (4)
1, 1.2,... (5)
2, 2.1,... (10)
3, 3.05,... (16)
3.8, 3.82,... (10)
*/

const tauRate = 1 / 5;
const pubExp = 0.18 * 5;
var getPublicationMultiplier = (tau) => tau.pow(pubExp);
var getPublicationMultiplierFormula = (symbol) =>
`{${symbol}}^{${pubExp.toFixed(1)}}`;

let bigNumArray = (array) => array.map(x => BigNumber.from(x));
const permaCosts = bigNumArray([1e6, 1e12, 1e18, 1e15]);
const milestoneCost = new CustomCost((level) =>
{
    switch(level)
    {
        case 0: return BigNumber.from(20 * tauRate);
        case 1: return BigNumber.from(40 * tauRate);
        case 2: return BigNumber.from(60 * tauRate);
        case 3: return BigNumber.from(120 * tauRate);
        case 4: return BigNumber.from(180 * tauRate);
    }
    return BigNumber.from(-1);
});

var reseed;
var c1, c2, xExp, r, resetr;
var autoPerma;
var lyapunovMs, c1ExpMs;

var currency;

var init = () =>
{
    currency = theory.createCurrency();
    /* Reset x
    Clicker game.
    */
    {
        reseed = theory.createSingularUpgrade(0, currency, new FreeCost);
        reseed.description = Utils.getMath(`t\\leftarrow 0`);
        reseed.info = getLoc('reseed');
        reseed.bought = (_) =>
        {
            turns = 0;
            time = 0;
            x = x0;
            lyapunovExpSum = 0;
            lyapunovExp = getLyapunovExp(lyapunovExpSum, turns);

            theory.invalidateTertiaryEquation();
        }
    }

    /* c1
    From 1 to 10 to 100.
    */
    {
        let getValueStr = (level) => `c_1=${getc1(level).toString(0)}`;
        let getExpStr = (level) =>
        {
            if(c1ExpMs.level)
                return `c_1^{${getc1Exp(c1ExpMs.level)}}=
                ${getc1(level).pow(getc1Exp(c1ExpMs.level))}`;

            return getValueStr(level);
        }
        c1 = theory.createUpgrade(1, currency, c1Cost);
        c1.getDescription = (_) => Utils.getMath(getValueStr(c1.level));
        c1.getInfo = (amount) => Utils.getMathTo(getExpStr(c1.level),
        getExpStr(c1.level + amount));
    }
    /* c2
    From 1 to 2 to 4.
    */
    {
        let getExpStr = (level) => `c_2=${c2Base.toString(0)}^{${level}}`;
        let getValueStr = (level) => `c_2=${getc2(level).toString(0)}`;
        c2 = theory.createUpgrade(2, currency, c2Cost);
        c2.getDescription = (_) => Utils.getMath(getExpStr(c2.level));
        c2.getInfo = (amount) => Utils.getMathTo(getValueStr(c2.level),
        getValueStr(c2.level + amount));
    }
    /* x exponent
    Ripped off of tempura control.
    */
    {
        xExp = theory.createUpgrade(3, currency, xExpCost);
        xExp.description = Localization.getUpgradeIncCustomExpDesc('x_t', 1);
        xExp.info = Localization.getUpgradeIncCustomExpInfo('x_t', 1);
        xExp.bought = (_) =>
        {
            theory.invalidateSecondaryEquation();
        }
        xExp.maxLevel = xExpMaxLevel;
    }
    /* r
    Seamless transition.

    Reset r
    For when you're stuck.
    */
    {
        let getValueStr = (level) => `r=${getr(level)}`;
        r = theory.createUpgrade(0, currency, rCost);
        r.getDescription = (_) => Utils.getMath(getValueStr(r.level));
        r.getInfo = (amount) => Utils.getMathTo(getValueStr(r.level),
        getValueStr(r.level + amount));
        r.maxLevel = rMaxLevel;

        resetr = theory.createUpgrade(10, currency, new FreeCost);
        resetr.getDescription = (_) => Localization.format(getLoc('reset'),
        Utils.getMath('r'), theory.buyAmountUpgrades === -1 ? getLoc('max'):
        `x${theory.buyAmountUpgrades}`);
        resetr.getInfo = (amount) => Utils.getMathTo(getValueStr(r.level),
        getValueStr(r.level - amount));
        resetr.bought = (_) =>
        {
            if(resetr.isAutoBuyable)
            {
                resetr.isAutoBuyable = false;
                return;
            }
            r.refund(theory.buyAmountUpgrades);
        }
        resetr.isAutoBuyable = false;
    }

    theory.createPublicationUpgrade(0, currency, permaCosts[0]);
    theory.createBuyAllUpgrade(1, currency, permaCosts[1]);
    theory.createAutoBuyerUpgrade(2, currency, permaCosts[2]);

    /* Auto-reseeder
    Collatz bread;
    */
    {
        autoPerma = theory.createPermanentUpgrade(3, currency,
        new CompositeCost(1, ConstantCost(permaCosts[3]), new FreeCost));
        autoPerma.description = getLoc('autoSeed');
        autoPerma.info = Localization.format(getLoc('autoSeedInfo'),
        Utils.getMath('t'));
        autoPerma.bought = (_) =>
        {
            if(autoPerma.level > 1)
            {
                autoPerma.level = 1;
                let menu = createAutoSeedMenu();
                menu.show();
            }
        }
    }

    theory.setMilestoneCost(milestoneCost);

    /* Unlock Lyapunov exp
    Crazy arse strats.
    */
    {
        lyapunovMs = theory.createMilestoneUpgrade(0, 1);
        lyapunovMs.description = Localization.getUpgradeUnlockDesc(
        `\\text{${getLoc('lyapunov')}}`);
        lyapunovMs.info = Localization.getUpgradeAddTermInfo(
        '\\lambda ');
        lyapunovMs.boughtOrRefunded = (_) =>
        {
            theory.invalidatePrimaryEquation();
            theory.invalidateSecondaryEquation();
        }
    }

    /* c1 exponent
    Typical.
    */
    {
        c1ExpMs = theory.createMilestoneUpgrade(1, c1ExpMaxLevel);
        c1ExpMs.description = Localization.getUpgradeIncCustomExpDesc('c_1',
        c1ExpInc);
        c1ExpMs.info = Localization.getUpgradeIncCustomExpInfo('c_1', c1ExpInc);
        c1ExpMs.boughtOrRefunded = (_) => theory.invalidateSecondaryEquation();
        c1ExpMs.maxLevel = c1ExpMaxLevel;
    }

    // theory.secondaryEquationScale = 1.1;
}

// let updateAvailability = () =>
// {
//     autoMenuPerma.isAvailable = autoPerma.level > 0;
// }

var tick = (elapsedTime, multiplier) =>
{
    if(!c1.level)
        return;

    ++time;
    while(time >= cooldown)
    {
        ++turns;
        if(autoSeedActive && turns === autoSeed + 1)
            reseed.buy(1);
        else
        {
            time -= cooldown;

            let rTerm = getr(r.level);
            lyapunovExpSum += Math.log(Math.abs(rTerm*(1-2*x)));
            lyapunovExp = getLyapunovExp(lyapunovExpSum, turns);
            x = rTerm * x * (1 - x);
        }
        theory.invalidateTertiaryEquation();
    }

    pubTime += elapsedTime;
    let dt = BigNumber.from(elapsedTime * multiplier);
    let c1Term = getc1(c1.level).pow(getc1Exp(c1ExpMs.level));
    let c2Term = getc2(c2.level);
    let xTermBase = 1 + x + lyapunovMs.level * Math.exp(lyapunovExp);
    let xTerm = BigNumber.from(xTermBase).pow(1 + xExp.level);

    currency.value += dt * c1Term * c2Term * xTerm *
    theory.publicationMultiplier;
}

var getEquationOverlay = () =>
{
    const unicodeLangs =
    {
        'zh-Hans': true,
        'zh-Hant': true
    };
    let result = ui.createGrid
    ({
        inputTransparent: true,
        cascadeInputTransparent: false,
        children:
        [
            ui.createLabel
            ({
                isVisible: () => menuLang in unicodeLangs ? true : false,
                verticalOptions: LayoutOptions.START,
                margin: new Thickness(6, 4),
                text: workInProgress ? Localization.format(getLoc('wip'),
                versionName) : versionName,
                fontSize: 11,
                textColor: Color.TEXT_MEDIUM
            }),
            ui.createLatexLabel
            ({
                isVisible: () => !(menuLang in unicodeLangs) ? true : false,
                verticalOptions: LayoutOptions.START,
                margin: new Thickness(6, 4),
                text: workInProgress ? Localization.format(getLoc('wip'),
                versionName) : versionName,
                fontSize: 9,
                textColor: Color.TEXT_MEDIUM
            }),
            ui.createLabel
            ({
                isVisible: () => menuLang in unicodeLangs ? true : false,
                horizontalOptions: LayoutOptions.END,
                verticalOptions: LayoutOptions.START,
                // verticalTextAlignment: TextAlignment.START,
                margin: new Thickness(6, 4),
                text: () =>
                {
                    let minutes = Math.floor(pubTime / 60);
                    let seconds = pubTime - minutes*60;
                    let timeString;
                    if(minutes >= 60)
                    {
                        let hours = Math.floor(minutes / 60);
                        minutes -= hours*60;
                        timeString = `${hours}:${
                        minutes.toString().padStart(2, '0')}:${
                        seconds.toFixed(1).padStart(4, '0')}`;
                    }
                    else
                    {
                        timeString = `${minutes.toString().padStart(2, '0')}:${
                        seconds.toFixed(1).padStart(4, '0')}`;
                    }
                    return Localization.format(getLoc('pubTime'),
                    timeString);
                },
                fontSize: 11,
                textColor: Color.TEXT_MEDIUM
            }),
            ui.createLatexLabel
            ({
                isVisible: () => !(menuLang in unicodeLangs) ? true : false,
                horizontalOptions: LayoutOptions.END,
                verticalOptions: LayoutOptions.START,
                // verticalTextAlignment: TextAlignment.START,
                margin: new Thickness(6, 4),
                text: () =>
                {
                    let minutes = Math.floor(pubTime / 60);
                    let seconds = pubTime - minutes*60;
                    let timeString;
                    if(minutes >= 60)
                    {
                        let hours = Math.floor(minutes / 60);
                        minutes -= hours*60;
                        timeString = `${hours}:${
                        minutes.toString().padStart(2, '0')}:${
                        seconds.toFixed(1).padStart(4, '0')}`;
                    }
                    else
                    {
                        timeString = `${minutes.toString().padStart(2, '0')}:${
                        seconds.toFixed(1).padStart(4, '0')}`;
                    }
                    return Localization.format(getLoc('pubTime'),
                    timeString);
                },
                fontSize: 9,
                textColor: Color.TEXT_MEDIUM
            })
        ]
    });
    return result;
}

var getPrimaryEquation = () =>
{
    let xStr = `x_0=${x0}\\\\x_{i+1}\\leftarrow rx_i(1-x_{i})
    ${lyapunovMs.level ? '=f(x_i)' : ''}`;
    let lStr;
    if(lyapunovMs.level)
    {
        lStr = `\\\\\\lambda = \\frac{1}{t}\\sum_{i=0}^{t-1}\\ln|f'(x_i)|`;
        theory.primaryEquationHeight = 87;
        theory.primaryEquationScale = 0.92;
    }
    else
    {
        lStr = '';
        theory.primaryEquationHeight = 48;
        theory.primaryEquationScale = 1;
    }
    return `\\begin{array}{c}${xStr}${lStr}\\end{array}`;
}

var getSecondaryEquation = () =>
{
    let rhoStr = `\\dot{\\rho}=
    c_1${c1ExpMs.level ? `^{${getc1Exp(c1ExpMs.level)}}` : ''}c_2
    (1${lyapunovMs.level ? '+e^\\lambda' : ''}+x_t)
    ${xExp.level ? `^{${1 + xExp.level}}` : ''}`;
    let tauStr = `,&${theory.latexSymbol}=\\max{\\rho}^{${tauRate}}`;
    return `\\begin{matrix}${rhoStr}${tauStr}\\end{matrix}`;
}

var getTertiaryEquation = () =>
{
    let tStr = `t=${turns}`;
    let xStr = `,&x_t=${x > 1e-3 ? x.toFixed(3) : x.toExponential(2)}`;
    let lStr = lyapunovMs.level ? `,&\\lambda =${lyapunovExp.toFixed(5)}` : '';
    return `\\begin{matrix}${tStr}${xStr}${lStr}\\end{matrix}`;
}

let createAutoSeedMenu = () =>
{
    let tmpEntry = ui.createEntry
    ({
        column: 0,
        text: autoSeed.toString(),
        keyboard: Keyboard.NUMERIC,
        horizontalTextAlignment: TextAlignment.END,
        onTextChanged: (ot, nt) =>
        {
            autoSeed = Number(nt);
        }
    });
    let tmpMinusBtn = ui.createButton
    ({
        column: 1,
        text: '–',
        onClicked: () =>
        {
            Sound.playClick();
            if(autoSeed > 0)
                tmpEntry.text = (autoSeed - 1).toString();
        }
    });
    let tmpPlusBtn = ui.createButton
    ({
        column: 2,
        text: '+',
        onClicked: () =>
        {
            Sound.playClick();
            tmpEntry.text = (autoSeed + 1).toString();
        }
    });
    let tmpGrid = ui.createGrid
    ({
        column: 1,
        columnDefinitions: ['2*', '1*', '1*'],
        children:
        [
            tmpEntry,
            tmpMinusBtn,
            tmpPlusBtn
        ]
    });
    let ASSwitch = ui.createSwitch
    ({
        isToggled: autoSeedActive,
        column: 2,
        // horizontalOptions: LayoutOptions.END,
        onTouched: (e) =>
        {
            if(e.type == TouchType.SHORTPRESS_RELEASED ||
            e.type == TouchType.LONGPRESS_RELEASED)
            {
                Sound.playClick();
                autoSeedActive = !autoSeedActive;
                ASSwitch.isToggled = autoSeedActive;
            }
        }
    });

    let menu = ui.createPopup
    ({
        isPeekable: true,
        title: getLoc('autoSeed'),
        content: ui.createGrid
        ({
            columnDefinitions: ['3*', '4*', '1*'],
            children:
            [
                ui.createLatexLabel
                ({
                    column: 0,
                    // horizontalTextAlignment: TextAlignment.CENTER,
                    verticalTextAlignment: TextAlignment.CENTER,
                    text: Localization.format(getLoc('autoSeedLabel'),
                    Utils.getMath('t='))
                }),
                tmpGrid,
                ASSwitch
            ]
        })
    });
    return menu;
}

var getTau = () => currency.value.pow(tauRate);

var getCurrencyFromTau = (tau) =>
[
    tau.max(BigNumber.ONE).pow(BigNumber.ONE / tauRate),
    currency.symbol
];

var postPublish = () =>
{
    pubTime = 0;
    turns = 0;
    time = 0;
    x = x0;
    lyapunovExpSum = 0;
    lyapunovExp = getLyapunovExp(lyapunovExpSum, turns);

    theory.invalidateSecondaryEquation();
    theory.invalidateTertiaryEquation();
}

var getInternalState = () => JSON.stringify
({
    version,
    pubTime,
    turns,
    time,
    x,
    lyapunovExpSum,
    lyapunovExp,
    autoSeed,
    autoSeedActive
})

var setInternalState = (stateStr) =>
{
    let state = JSON.parse(stateStr);
    let v = state.version ?? version;
    pubTime = state.pubTime ?? pubTime;
    turns = state.turns ?? turns;
    time = state.time ?? time;
    x = state.x ?? x;
    lyapunovExpSum = state.lyapunovExpSum ?? lyapunovExpSum;
    lyapunovExp = state.lyapunovExp ?? lyapunovExp;
    autoSeed = state.autoSeed ?? autoSeed;
    autoSeedActive = state.autoSeedActive ?? autoSeedActive;

    theory.invalidatePrimaryEquation();
    theory.invalidateSecondaryEquation();
    theory.invalidateTertiaryEquation();
    theory.clearGraph();
}

let interpolate = (t) => {
    let v1 = t * t;
    let v2 = 1 - (1 - t) * (1 - t);
    return v1 * (1 - t) + v2 * t;
};

var get2DGraphValue = () => x;
// {
//     let rTerm = getr(r.level);
//     let x1 = rTerm * x * (1 - x);
//     let offset = time / cooldown;
//     return x * (1-offset) + x1 * offset;
// };

init();
