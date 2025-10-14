export interface GisVersion {
    name: string
    version?: string
    directory: string
}

export interface LayeredProduct {
    name: string
    path: string
    version?: string
}

export interface GisAlias {
    name: string
    title: string
    session?: string
    product?: string
    program?: string
    args?: string
    splash_screen?: string
    icon_file?: string
    // TODO: check if this is a limited list, else check if it is possible to allow any key/value pair
    SW_ACE_DB_DIR?: string
    SW_CONSTRUCTION_PACK_DIR?: string
    SW_JOB_SERVER_LOGGING_OUTPUT?: string
    SW_LAUNCH_JAVA_ARGS?: string

}