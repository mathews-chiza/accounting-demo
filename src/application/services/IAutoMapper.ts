export default interface IAutoMapper<TSource, TDestination> {
  map<T extends TSource | TSource[]>(source: T): T extends TSource[]
    ? TDestination[]
    : TDestination;
}
