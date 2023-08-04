import { BigNumber } from '../api/BigNumber';
import { CompositeCost, ExponentialCost, FirstFreeCost, FreeCost, LinearCost } from '../api/Costs';
import { Localization } from '../api/Localization';
import { theory } from '../api/Theory';
import { ui } from '../api/ui/UI';
import { Utils } from '../api/Utils';
import { StackOrientation } from '../api/ui/properties/StackOrientation';
import { TextAlignment } from '../api/ui/properties/TextAlignment';

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
var version = 0;

const locStrings =
{
    en:
    {
        lyapunov: 'the Lyapunov exponent',
        reseed: 'Reseeds the population',
        reset: 'Refund {0}',
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
let getLyapunovExp = () => turns ? lyapunovExpSum / turns : 0;

let turns = 0;
let time = 0;
let x = x0;
let lyapunovExpSum = 0;
let lyapunovExp = getLyapunovExp();
let autoSeed = -1;

const c1Cost = new FirstFreeCost(new ExponentialCost(10, 0.5));
const getc1 = (level) => Utils.getStepwisePowerSum(level, 2, 9, 1);

const c2Cost = new ExponentialCost(100 * Math.sqrt(10), 0.5 * 4);
const c2Base = BigNumber.TWO;
const getc2 = (level) => c2Base.pow(level);

const xExpMaxLevel = 40;
const xExpCost = new ExponentialCost(100, 9);

const rMaxLevel = 37;
const rCost = new CompositeCost(3, new ExponentialCost(1e4, Math.log2(1e4)),
new CompositeCost(4, new ExponentialCost(1e20, Math.log2(1e5)),
new CompositeCost(10, new ExponentialCost(1e50, Math.log2(1e6)),
new CompositeCost(8, new ExponentialCost(1e150, Math.log2(10 ** 7.5)),
new CompositeCost(8, new ExponentialCost(1e225, Math.log2(1e9)),
new CompositeCost(4, new ExponentialCost(1e300, Math.log2(1e15)),
new ConstantCost(BigNumber.from('1e360'))))))));
const getr = (level) => level >= 37 ? 4 :
(level >= 17 ? 3 + (level-17)/20 :
(level >= 7 ? 2 + (level-7)/10 :
(level >= 2 ? 1 + (level-2)/5 : level/2)));

const tauRate = 1 / 5;
const pubExp = 0.18 * 5;
var getPublicationMultiplier = (tau) => tau.pow(pubExp);
var getPublicationMultiplierFormula = (symbol) =>
`{${symbol}}^{${pubExp.toFixed(1)}}`;

let bigNumArray = (array) => array.map(x => BigNumber.from(x));
const permaCosts = bigNumArray([1e6, 1e15, 1e21, 1e9]);
const milestoneCost = new CustomCost((level) =>
{
    if(level == 0) return BigNumber.from(25 * tauRate);
    return BigNumber.from(-1);
});

var reseed;
var c1, c2, xExp, r;
var autoPerma, resetr;
var lyapunovMs;

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
            lyapunovExp = getLyapunovExp();

            theory.invalidateTertiaryEquation();
        }
    }

    /* c1
    From 1 to 10 to 100.
    */
    {
        let getValueStr = (level) => `c_1=${getc1(level).toString(0)}`;
        c1 = theory.createUpgrade(1, currency, c1Cost);
        c1.getDescription = (_) => Utils.getMath(getValueStr(c1.level));
        c1.getInfo = (amount) => Utils.getMathTo(getValueStr(c1.level),
        getValueStr(c1.level + amount));
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
    */
    {
        let getValueStr = (level) => `r=${getr(level)}`;
        r = theory.createUpgrade(0, currency, rCost);
        r.getDescription = (_) => Utils.getMath(getValueStr(r.level));
        r.getInfo = (amount) => Utils.getMathTo(getValueStr(r.level),
        getValueStr(r.level + amount));
        r.maxLevel = rMaxLevel;
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
    /* Reset r
    For when you're stuck.
    */
    {
        resetr = theory.createPermanentUpgrade(10, currency, new FreeCost);
        resetr.description = Localization.format(getLoc('reset'),
        Utils.getMath('r'));
        resetr.info = Localization.format(getLoc('resetrInfo'),
        Utils.getMath('r'));
        resetr.bought = (_) =>
        {
            r.refund(r.level);
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
        if(turns === autoSeed + 1)
            reseed.buy(1);
        else
        {
            time -= cooldown;

            let rTerm = getr(r.level);
            lyapunovExpSum += Math.log(Math.abs(rTerm*(1-2*x)));
            lyapunovExp = getLyapunovExp();
            x = rTerm * x * (1 - x);
        }
        theory.invalidateTertiaryEquation();
    }

    let dt = BigNumber.from(elapsedTime * multiplier);
    let c1Exp = lyapunovMs.level ? 1 + lyapunovExp : 1;
    let c1Term = lyapunovMs.level && c1Exp === -Infinity ?
    BigNumber.ZERO : getc1(c1.level).pow(c1Exp);
    let c2Term = getc2(c2.level);
    let xTerm = BigNumber.from(1 + x).pow(1 + xExp.level);

    currency.value += dt * c1Term * c2Term * xTerm *
    theory.publicationMultiplier;
}

var getPrimaryEquation = () =>
{
    let xStr = `x_0=${x0}\\\\x_{i+1}\\leftarrow rx_i(1-x_{i})
    ${lyapunovMs.level ? '=f(x_i)' : ''}`;
    let lStr;
    if(lyapunovMs.level)
    {
        lStr = `\\\\\\lambda = \\displaystyle\\frac{1}{t}\\sum_{i=0}^{t-1}\\ln|f'(x_i)|`;
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
    let rhoStr = `\\dot{\\rho}=c_1${lyapunovMs.level ? '^{1+\\lambda}' : ''}c_2
    (1+x_t)${xExp.level ? `^{${1 + xExp.level}}` : ''}`;
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
            if(autoSeed > -1)
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

    let menu = ui.createPopup
    ({
        isPeekable: true,
        title: getLoc('autoSeed'),
        content: ui.createGrid
        ({
            columnDefinitions: ['1*', '1*'],
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
                tmpGrid
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
    turns = 0;
    time = 0;
    x = x0;
    lyapunovExpSum = 0;
    lyapunovExp = getLyapunovExp();
}

var getInternalState = () => JSON.stringify
({
    version,
    turns,
    time,
    x,
    lyapunovExpSum,
    lyapunovExp,
    autoSeed
})

var setInternalState = (stateStr) =>
{
    let state = JSON.parse(stateStr);
    let v = state.version ?? version;
    turns = state.turns ?? turns;
    time = state.time ?? time;
    x = state.x ?? x;
    lyapunovExpSum = state.lyapunovExpSum ?? lyapunovExpSum;
    lyapunovExp = state.lyapunovExp ?? lyapunovExp;
    autoSeed = state.autoSeed ?? autoSeed;

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
