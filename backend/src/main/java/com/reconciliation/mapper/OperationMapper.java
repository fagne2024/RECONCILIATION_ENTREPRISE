package com.reconciliation.mapper;

import com.reconciliation.dto.OperationCreateRequest;
import com.reconciliation.dto.OperationDTO;
import com.reconciliation.entity.CompteEntity;
import com.reconciliation.entity.OperationEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.Named;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.ReportingPolicy;

@Mapper(
    componentModel = "spring",
    nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE,
    unmappedTargetPolicy = ReportingPolicy.IGNORE
)
public interface OperationMapper {

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "compte", ignore = true)
    @Mapping(target = "dateOperation", source = "dateOperation", qualifiedByName = "stringToLocalDateTime")
    OperationEntity toEntity(OperationCreateRequest request);

    @Mapping(target = "compteId", source = "compte.id")
    @Mapping(target = "compteNumero", source = "compte.numeroCompte")
    OperationDTO toDTO(OperationEntity entity);

    @Mapping(target = "id", ignore = true)
    @Mapping(target = "compte", ignore = true)
    @Mapping(target = "dateOperation", source = "dateOperation", qualifiedByName = "stringToLocalDateTime")
    void updateEntityFromRequest(OperationCreateRequest request, @MappingTarget OperationEntity entity);

    @Named("stringToLocalDateTime")
    default java.time.LocalDateTime stringToLocalDateTime(String dateStr) {
        if (dateStr == null || dateStr.isBlank()) {
            return null;
        }
        try {
            return java.time.LocalDateTime.parse(dateStr);
        } catch (Exception e) {
            return java.time.LocalDateTime.parse(dateStr + "T00:00:00");
        }
    }
}