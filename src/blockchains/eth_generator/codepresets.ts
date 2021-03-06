import {
    PUSH_CONSTRUCTION,
    TIMING_DEFINITION,
    MASTER_CONTRACT_DEFINITION,
    IETHType,
    IETHDataType,
    IWideDataType
} from "./consts";

export const getMasterContract = () => {
    return MASTER_CONTRACT_DEFINITION;
}

export const getPushFunction = (binding: string, type: IETHType) => {
    const { inputs, value } = PUSH_CONSTRUCTION[type];
    return `
    function push_data_${type}(string name, ${inputs.map(inp => `${inp.type} ${inp.name}`).join(', ')}) onlyDataPublisher public {
        ${binding}[name].last_update = block.number;
        ${getTypeBinding(type)}[name] = ${value};
    }`
}

export const getGetter = (name: string, hash: string, type: IETHType) => {
    return `function get${name}() dataFresh("${hash}") public returns (${PUSH_CONSTRUCTION[type].rettype || type}) {
        if (!check_data_age("${hash}")) {
            request_data("${hash}");
        }
        return ${getTypeBinding(type)}["${hash}"]${PUSH_CONSTRUCTION[type].getter || ''};
    }`
}

const toDataType = (d: IWideDataType) => <IETHDataType>({
    type: d.type,
    name: d.name,
    hash: d.hash,
    decimals: d.decimals || 0,
    value: PUSH_CONSTRUCTION[d.type].evaluate(d)
})

const getTypeBinding = (type: string) => type[0] + '_data';

class Data {
    binding: string = 'data_timing'
    types: IETHType[] = []
    data: { [key: string]: { value: IETHDataType, life: number, update: number } } = {}

    constructor(binding: string) { this.binding = binding; }

    addType(type: IETHType) {
        if (!this.types.includes(type)) {
            this.types.push(type);
        }
    }

    addDataType(data_type: IWideDataType, update: number, life: number) {
        this.addType(data_type.type);
        this.data[data_type.hash] = {
            value: toDataType(data_type),
            update,
            life
        }
    }

    getDataDefinition(name: string, { value, update, life }: { value: IETHDataType, life: number, update: number }) {
        let timings = '';
        if (!value.value) {
            timings = `${this.binding}["${name}"] = Data(${update}, ${life}, 0);`;
            timings += `
        request_data("${name}");`;
        } else {
            timings = `${this.binding}["${name}"] = Data(${update}, ${life}, block.number);`;
            timings += `
        ${getTypeBinding(value.type)}["${name}"] = ${value.value};`;
        }
        return timings;
    }

    getStruct() {
        let openStruct = TIMING_DEFINITION;
        this.types.forEach(type => openStruct += PUSH_CONSTRUCTION[type].struct_definition || '')
        const types = this.types.reduce((prev, curr) => prev + `\n    mapping(string => ${PUSH_CONSTRUCTION[curr].in_code || curr}) ${getTypeBinding(curr)};`, '');
        return `${openStruct}${types}`;
    }

    getConstructorInserts() {
        return Object
            .entries(this.data)
            .map(([hash, dt]) => this.getDataDefinition(hash, dt))
            .reduce((prev, curr) => prev + '\n        ' + curr);
    }

    getGetters() {
        return Object
            .entries(this.data)
            .map(([hash, dt]) => getGetter(dt.value.name, hash, dt.value.type))
            .reduce((prev, curr) => prev + '\n\n    ' + curr);
    }

    getPushFunctions() {
        return this.types
            .map(type => getPushFunction(this.binding, type))
            .reduce((prev, curr) => prev + '\n    ' + curr);
    }
}

export const getContractBase = (name: string, inputs: IWideDataType[]) => {
    const imports = getMasterContract();
    const binding = 'data_timings';
    const data = new Data(binding);
    inputs.forEach(inp => {
        if (!inp.update || !inp.life || !inp.hash) throw new Error(`Not specified life, update or hash for ${inp.name}.`);
        if (inp.update >= inp.life) throw new Error(`Update frequency could not be greater or equal to life for ${inp.name}.`)
        data.addDataType(inp, inp.update, inp.life);
    });

    return `pragma solidity ^0.4.24;
${imports}

contract ${name} {
    address data_provider;
    address data_publisher;
    ${data.getStruct()}
    mapping(string => Data) ${binding};

    constructor(address master_oracle, address data_pub) {
        data_provider = master_oracle;
        data_publisher = data_pub;
        ${data.getConstructorInserts()}
    }

    modifier onlyDataPublisher() {
        require(data_publisher == msg.sender);
        _;
    }

    modifier nonEmptyLife(string name) {
        require(${binding}[name].life_time != 0);
        _;
    }

    modifier dataAntique(string name) {
        require(block.number > ${binding}[name].last_update + ${binding}[name].life_time);
        _;
    }

    modifier dataFresh(string name) {
        require(block.number < ${binding}[name].last_update + ${binding}[name].life_time);
        _;
    }

    modifier dataNeedRefresh(string name) {
        require(block.number > ${binding}[name].last_update + ${binding}[name].update_time);
        _;
    }

    /**
     * Check data age:
     * returns true, if data is valid;
     * returns false, if data needs to be updated;
     * throws error, if data is outdated (manual update call needed).
     */
    function check_data_age(string name) dataFresh(name) view private returns(bool) {
        return block.number < (${binding}[name].last_update + ${binding}[name].update_time);
    }
    ${data.getPushFunctions()}

    function request_data_manually(string name) nonEmptyLife(name) dataAntique(name) public {
        MasterOracle master = MasterOracle(data_provider);
        master.request_data(name, this);
    }

    function request_data(string name) nonEmptyLife(name) dataNeedRefresh(name) private {
        MasterOracle master = MasterOracle(data_provider);
        master.request_data(name, this);
    }
    
    ${data.getGetters()}
}`.replace(/\x20+$/gm, "")
}